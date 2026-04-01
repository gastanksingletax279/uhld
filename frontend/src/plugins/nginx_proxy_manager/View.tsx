import { useEffect, useState } from 'react'
import { api, NpmProxyHost, NpmCertificate, NpmAccessList } from '../../api/client'

interface HostFormData {
  domain_names: string[]
  forward_scheme: string
  forward_host: string
  forward_port: number
  certificate_id: number | string
  ssl_forced: boolean
  http2_support: boolean
  block_exploits: boolean
  access_list_id: number | string
  allow_websocket_upgrade: boolean
  advanced_config: string
}

interface CertFormData {
  provider: string
  nice_name: string
  domain_names: string[]
  meta: {
    letsencrypt_email?: string
    dns_challenge?: boolean
    dns_provider?: string
  }
}

export function NginxProxyManagerView({ instanceId = 'default' }: { instanceId?: string }) {
  const npmApi = api.nginxProxyManager(instanceId)
  const [hosts, setHosts] = useState<NpmProxyHost[]>([])
  const [certificates, setCertificates] = useState<NpmCertificate[]>([])
  const [accessLists, setAccessLists] = useState<NpmAccessList[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [actioningId, setActioningId] = useState<number | null>(null)
  const [tab, setTab] = useState<'hosts' | 'certificates'>('hosts')
  
  // Modals
  const [showHostModal, setShowHostModal] = useState(false)
  const [editingHost, setEditingHost] = useState<NpmProxyHost | null>(null)
  const [showCertModal, setShowCertModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'host' | 'cert', id: number, name: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [hostsData, certsData, accessListsData] = await Promise.all([
        npmApi.listHosts(),
        npmApi.listCertificates(),
        npmApi.listAccessLists().catch(() => ({ items: [] })),
      ])
      setHosts(hostsData.items)
      setCertificates(certsData.items)
      setAccessLists(accessListsData.items)
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function toggleHost(host: NpmProxyHost) {
    setActioningId(host.id)
    try {
      const isEnabled = typeof host.enabled === 'number' ? host.enabled === 1 : host.enabled
      if (isEnabled) {
        await npmApi.disableHost(host.id)
      } else {
        await npmApi.enableHost(host.id)
      }
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to toggle host')
    } finally {
      setActioningId(null)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return
    setActioningId(deleteConfirm.id)
    try {
      if (deleteConfirm.type === 'host') {
        await npmApi.deleteHost(deleteConfirm.id)
      } else {
        await npmApi.deleteCertificate(deleteConfirm.id)
      }
      setDeleteConfirm(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setActioningId(null)
    }
  }

  function getCertificateName(certId: number | undefined): string {
    if (!certId) return 'None'
    const cert = certificates.find((c) => c.id === certId)
    return cert?.nice_name || cert?.domain_names?.join(', ') || `Cert ${certId}`
  }

  function getAccessListName(listId: number | string | undefined): string {
    if (!listId) return 'None'
    const list = accessLists.find((a) => a.id === Number(listId))
    return list?.name || `Access List ${listId}`
  }

  function formatExpiryDate(expiresOn: string | undefined): string {
    if (!expiresOn) return 'Unknown'
    try {
      const date = new Date(expiresOn)
      const now = new Date()
      const daysUntilExpiry = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntilExpiry < 0) return '🔴 Expired'
      if (daysUntilExpiry < 7) return `🟡 ${daysUntilExpiry}d left`
      if (daysUntilExpiry < 30) return `🟢 ${daysUntilExpiry}d left`
      return `🟢 ${Math.floor(daysUntilExpiry / 30)}mo left`
    } catch {
      return 'Invalid date'
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Nginx Proxy Manager</h2>
        <div className="flex items-center gap-2">
          <button 
            className="btn-ghost text-sm" 
            onClick={() => load()} 
            disabled={loading}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-200">
          ❌ {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-surface-3">
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'hosts'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-gray-200'
            }`}
            onClick={() => setTab('hosts')}
          >
            Proxy Hosts ({hosts.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'certificates'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-gray-200'
            }`}
            onClick={() => setTab('certificates')}
          >
            Certificates ({certificates.length})
          </button>
        </div>
        <button
          className="btn-primary text-sm mb-2"
          onClick={() => {
            if (tab === 'hosts') {
              setEditingHost(null)
              setShowHostModal(true)
            } else {
              setShowCertModal(true)
            }
          }}
        >
          + Add {tab === 'hosts' ? 'Proxy Host' : 'Certificate'}
        </button>
      </div>

      {/* Proxy Hosts Tab */}
      {tab === 'hosts' && (
        <div className="space-y-3">
          {hosts.length === 0 && (
            <div className="text-sm text-muted text-center py-8">
              No proxy hosts configured. Click "Add Proxy Host" to create one.
            </div>
          )}
          {hosts.map((host) => {
            const isEnabled = typeof host.enabled === 'number' ? host.enabled === 1 : host.enabled
            const hasSsl = !!host.certificate_id
            const sslForced = typeof host.ssl_forced === 'number' ? host.ssl_forced === 1 : host.ssl_forced
            const http2 = typeof host.http2_support === 'number' ? host.http2_support === 1 : host.http2_support
            const blockExploits = typeof host.block_exploits === 'number' ? host.block_exploits === 1 : host.block_exploits
            const hasAccessList = !!host.access_list_id
            const hasAdvancedConfig = !!(host.advanced_config && host.advanced_config.trim())

            return (
              <div key={host.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="font-semibold text-base text-gray-100 truncate">
                        {host.domain_names?.join(', ') || `Host ${host.id}`}
                      </div>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          isEnabled
                            ? 'bg-green-900/30 text-green-300'
                            : 'bg-gray-700/50 text-gray-400'
                        }`}
                      >
                        {isEnabled ? '● Online' : '○ Offline'}
                      </span>
                    </div>

                    <div className="text-sm text-muted mb-2">
                      <span className="text-gray-400">→</span>{' '}
                      {host.forward_host || '(no forward)'}:{host.forward_port || '?'}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {hasSsl && (
                        <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded">
                          🔒 SSL: {getCertificateName(host.certificate_id)}
                        </span>
                      )}
                      {sslForced && (
                        <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded">
                          🔐 Force SSL
                        </span>
                      )}
                      {http2 && (
                        <span className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded">
                          HTTP/2
                        </span>
                      )}
                      {blockExploits && (
                        <span className="px-2 py-1 bg-orange-900/30 text-orange-300 rounded">
                          🛡️ Block Exploits
                        </span>
                      )}
                      {hasAccessList && (
                        <span className="px-2 py-1 bg-yellow-900/30 text-yellow-300 rounded">
                          🔑 {getAccessListName(host.access_list_id)}
                        </span>
                      )}
                      {hasAdvancedConfig && (
                        <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded">
                          ⚙️ Custom Config
                        </span>
                      )}
                      {host.allow_websocket_upgrade && (
                        <span className="px-2 py-1 bg-teal-900/30 text-teal-300 rounded">
                          🔌 WebSocket
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn-ghost text-sm"
                      onClick={() => {
                        setEditingHost(host)
                        setShowHostModal(true)
                      }}
                      title="Edit host"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className={`btn-sm ${isEnabled ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleHost(host)}
                      disabled={actioningId === host.id}
                      title={isEnabled ? 'Disable host' : 'Enable host'}
                    >
                      {actioningId === host.id ? '⏳' : isEnabled ? '⏸️' : '▶️'}
                    </button>
                    <button
                      className="btn-ghost text-sm text-red-400 hover:text-red-300"
                      onClick={() => setDeleteConfirm({ type: 'host', id: host.id, name: host.domain_names?.join(', ') || `Host ${host.id}` })}
                      title="Delete host"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Certificates Tab */}
      {tab === 'certificates' && (
        <div className="space-y-3">
          {certificates.length === 0 && (
            <div className="text-sm text-muted text-center py-8">
              No SSL certificates configured. Click "Add Certificate" to create one.
            </div>
          )}
          {certificates.map((cert) => (
            <div key={cert.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-gray-100 mb-1">
                    {cert.nice_name || `Certificate ${cert.id}`}
                  </div>
                  <div className="text-sm text-muted mb-2">
                    {cert.domain_names?.join(', ') || 'No domains'}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded">
                      Provider: {cert.provider || 'Unknown'}
                    </span>
                    {cert.expires_on && (
                      <span className="px-2 py-1 bg-surface-3 text-gray-300 rounded">
                        Expires: {formatExpiryDate(cert.expires_on)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="btn-ghost text-sm text-red-400 hover:text-red-300"
                  onClick={() => setDeleteConfirm({ type: 'cert', id: cert.id, name: cert.nice_name || `Cert ${cert.id}` })}
                  title="Delete certificate"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Host Create/Edit Modal */}
      {showHostModal && (
        <HostFormModal
          host={editingHost}
          certificates={certificates}
          accessLists={accessLists}
          onClose={() => {
            setShowHostModal(false)
            setEditingHost(null)
          }}
          onSave={async (data) => {
            try {
              if (editingHost) {
                await npmApi.updateHost(editingHost.id, data)
              } else {
                await npmApi.createHost(data)
              }
              setShowHostModal(false)
              setEditingHost(null)
              await load()
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Failed to save host')
            }
          }}
        />
      )}

      {/* Certificate Create Modal */}
      {showCertModal && (
        <CertFormModal
          onClose={() => setShowCertModal(false)}
          onSave={async (data) => {
            try {
              await npmApi.createCertificate(data)
              setShowCertModal(false)
              await load()
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Failed to create certificate')
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full border border-surface-3">
            <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
            <p className="text-sm text-muted mb-6">
              Are you sure you want to delete <span className="text-gray-100 font-medium">{deleteConfirm.name}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={actioningId !== null}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={actioningId === deleteConfirm.id}
              >
                {actioningId === deleteConfirm.id ? '⏳ Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Host Form Modal Component
function HostFormModal({
  host,
  certificates,
  accessLists,
  onClose,
  onSave,
}: {
  host: NpmProxyHost | null
  certificates: NpmCertificate[]
  accessLists: NpmAccessList[]
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
}) {
  const [domains, setDomains] = useState(host?.domain_names?.join(', ') || '')
  const [forwardScheme, setForwardScheme] = useState((host?.forward_scheme as string) || 'http')
  const [forwardHost, setForwardHost] = useState(host?.forward_host || '')
  const [forwardPort, setForwardPort] = useState(String(host?.forward_port || ''))
  const [certId, setCertId] = useState(String(host?.certificate_id || '0'))
  const [sslForced, setSslForced] = useState(!!(typeof host?.ssl_forced === 'number' ? host.ssl_forced : host?.ssl_forced))
  const [http2, setHttp2] = useState(!!(typeof host?.http2_support === 'number' ? host.http2_support : host?.http2_support))
  const [blockExploits, setBlockExploits] = useState(!!(typeof host?.block_exploits === 'number' ? host.block_exploits : host?.block_exploits))
  const [accessListId, setAccessListId] = useState(String(host?.access_list_id || '0'))
  const [websocket, setWebsocket] = useState(!!(typeof host?.allow_websocket_upgrade === 'number' ? host.allow_websocket_upgrade : host?.allow_websocket_upgrade))
  const [advancedConfig, setAdvancedConfig] = useState(host?.advanced_config || '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const data: Record<string, unknown> = {
        domain_names: domains.split(',').map(d => d.trim()).filter(Boolean),
        forward_scheme: forwardScheme,
        forward_host: forwardHost,
        forward_port: parseInt(forwardPort) || 80,
        certificate_id: parseInt(certId) || 0,
        ssl_forced: sslForced ? 1 : 0,
        http2_support: http2 ? 1 : 0,
        block_exploits: blockExploits ? 1 : 0,
        access_list_id: parseInt(accessListId) || 0,
        allow_websocket_upgrade: websocket ? 1 : 0,
        advanced_config: advancedConfig,
      }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface-2 rounded-lg p-6 max-w-2xl w-full border border-surface-3 my-8">
        <h3 className="text-lg font-semibold mb-4">
          {host ? 'Edit' : 'Create'} Proxy Host
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Domain Names (comma-separated)</label>
            <input
              type="text"
              className="input w-full"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com, www.example.com"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Scheme</label>
              <select className="input w-full" value={forwardScheme} onChange={(e) => setForwardScheme(e.target.value)}>
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Forward Host/IP</label>
              <input
                type="text"
                className="input w-full"
                value={forwardHost}
                onChange={(e) => setForwardHost(e.target.value)}
                placeholder="192.168.1.100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="number"
                className="input w-full"
                value={forwardPort}
                onChange={(e) => setForwardPort(e.target.value)}
                placeholder="80"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">SSL Certificate</label>
            <select className="input w-full" value={certId} onChange={(e) => setCertId(e.target.value)}>
              <option value="0">None</option>
              {certificates.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nice_name || c.domain_names?.join(', ') || `Cert ${c.id}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Access List</label>
            <select className="input w-full" value={accessListId} onChange={(e) => setAccessListId(e.target.value)}>
              <option value="0">None</option>
              {accessLists.map(a => (
                <option key={a.id} value={a.id}>{a.name || `List ${a.id}`}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sslForced} onChange={(e) => setSslForced(e.target.checked)} />
              <span className="text-sm">Force SSL</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={http2} onChange={(e) => setHttp2(e.target.checked)} />
              <span className="text-sm">HTTP/2 Support</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={blockExploits} onChange={(e) => setBlockExploits(e.target.checked)} />
              <span className="text-sm">Block Common Exploits</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={websocket} onChange={(e) => setWebsocket(e.target.checked)} />
              <span className="text-sm">WebSocket Support</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Advanced Nginx Config (optional)</label>
            <textarea
              className="input w-full font-mono text-xs"
              rows={4}
              value={advancedConfig}
              onChange={(e) => setAdvancedConfig(e.target.value)}
              placeholder="# Custom nginx directives"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '⏳ Saving...' : host ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Certificate Form Modal Component
function CertFormModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
}) {
  const [provider, setProvider] = useState('letsencrypt')
  const [niceName, setNiceName] = useState('')
  const [domains, setDomains] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const data: Record<string, unknown> = {
        provider,
        nice_name: niceName,
        domain_names: domains.split(',').map(d => d.trim()).filter(Boolean),
        meta: {
          letsencrypt_email: email,
          letsencrypt_agree: true,
        },
      }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-2 rounded-lg p-6 max-w-lg w-full border border-surface-3">
        <h3 className="text-lg font-semibold mb-4">Create SSL Certificate</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Friendly Name</label>
            <input
              type="text"
              className="input w-full"
              value={niceName}
              onChange={(e) => setNiceName(e.target.value)}
              placeholder="My Certificate"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Domain Names (comma-separated)</label>
            <input
              type="text"
              className="input w-full"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com, *.example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select className="input w-full" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="letsencrypt">Let's Encrypt</option>
              <option value="other">Other</option>
            </select>
          </div>

          {provider === 'letsencrypt' && (
            <div>
              <label className="block text-sm font-medium mb-1">Email Address</label>
              <input
                type="email"
                className="input w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
              <p className="text-xs text-muted mt-1">
                Required for Let's Encrypt certificate notifications
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '⏳ Creating...' : 'Create Certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
