import { useEffect, useMemo, useState } from 'react'
import {
  api,
  CloudflareAnalytics,
  CloudflareDnsRecord,
  CloudflareDnsRecordInput,
  CloudflareFirewallRule,
  CloudflareZone,
  CloudflareZoneSettings,
} from '../../api/client'
import { getViewState, setViewState } from '../../store/viewStateStore'
import {
  AlertCircle,
  Cloud,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  Plus,
  Pencil,
  Flame,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Tab = 'zones' | 'dns' | 'analytics' | 'settings' | 'security'
type Range = '24h' | '7d' | '30d'

type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS'

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS']

interface DnsFormState {
  type: DnsRecordType
  name: string
  content: string
  ttl: number
  proxied: boolean
  comment: string
  priority: number
  service: string
  protocol: string
  weight: number
  port: number
  target: string
  flags: number
  tag: string
  value: string
}

const EMPTY_FORM: DnsFormState = {
  type: 'A',
  name: '',
  content: '',
  ttl: 1,
  proxied: false,
  comment: '',
  priority: 10,
  service: '_sip',
  protocol: '_tcp',
  weight: 10,
  port: 5060,
  target: '',
  flags: 0,
  tag: 'issue',
  value: '',
}

export function CloudflareView({ instanceId = 'default' }: { instanceId?: string }) {
  const cf = api.cloudflare(instanceId)
  const _key = `cloudflare:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'zones') as Tab)
  function setTab(next: Tab) {
    setViewState(`${_key}:tab`, next)
    setTabRaw(next)
  }

  const [zones, setZones] = useState<CloudflareZone[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [dnsRecords, setDnsRecords] = useState<CloudflareDnsRecord[]>([])
  const [dnsTypeFilter, setDnsTypeFilter] = useState('')
  const [dnsNameFilter, setDnsNameFilter] = useState('')
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<CloudflareDnsRecord | null>(null)
  const [form, setForm] = useState<DnsFormState>(EMPTY_FORM)

  const [analyticsRange, setAnalyticsRange] = useState<Range>('24h')
  const [analytics, setAnalytics] = useState<CloudflareAnalytics | null>(null)

  const [settings, setSettings] = useState<CloudflareZoneSettings | null>(null)
  const [firewallRules, setFirewallRules] = useState<CloudflareFirewallRule[]>([])
  const [upgradeRequired, setUpgradeRequired] = useState(false)

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null

  async function loadZones() {
    setLoading(true)
    setError(null)
    try {
      const data = await cf.zones()
      setZones(data.zones)
      if (!selectedZoneId && data.zones.length > 0) {
        setSelectedZoneId(data.zones[0].id)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }

  async function loadDns() {
    if (!selectedZoneId) return
    try {
      const data = await cf.dnsRecords(selectedZoneId, dnsTypeFilter || undefined, dnsNameFilter || undefined)
      setDnsRecords(data.records)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load DNS records')
    }
  }

  async function loadAnalytics() {
    if (!selectedZoneId) return
    try {
      const data = await cf.analytics(selectedZoneId, analyticsRange)
      setAnalytics(data.analytics)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    }
  }

  async function loadSettings() {
    if (!selectedZoneId) return
    try {
      const data = await cf.settings(selectedZoneId)
      setSettings(data.settings)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    }
  }

  async function loadSecurity() {
    if (!selectedZoneId) return
    try {
      const data = await cf.firewallRules(selectedZoneId)
      setFirewallRules(data.rules || [])
      setUpgradeRequired(Boolean(data.upgrade_required))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load firewall rules')
    }
  }

  useEffect(() => {
    loadZones().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (tab === 'dns') loadDns().catch(() => undefined)
    if (tab === 'analytics') loadAnalytics().catch(() => undefined)
    if (tab === 'settings') loadSettings().catch(() => undefined)
    if (tab === 'security') loadSecurity().catch(() => undefined)
  }, [tab, selectedZoneId, analyticsRange])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  async function zoneAction(action: 'pause' | 'unpause' | 'purge', zoneId: string) {
    setBusy(`${action}:${zoneId}`)
    setError(null)
    try {
      if (action === 'pause') await cf.pauseZone(zoneId)
      if (action === 'unpause') await cf.unpauseZone(zoneId)
      if (action === 'purge') await cf.purgeCache(zoneId)
      setToast(action === 'purge' ? 'Cache purge started' : 'Zone updated')
      await loadZones()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Zone action failed')
    } finally {
      setBusy(null)
    }
  }

  function openCreateModal() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM })
    setShowRecordModal(true)
  }

  function openEditModal(record: CloudflareDnsRecord) {
    setEditingRecord(record)
    const t = (record.type || 'A').toUpperCase() as DnsRecordType
    const data = (record.data || {}) as Record<string, unknown>
    setForm({
      type: DNS_TYPES.includes(t) ? t : 'A',
      name: record.name || '',
      content: record.content || '',
      ttl: Number(record.ttl || 1),
      proxied: Boolean(record.proxied),
      comment: String(record.comment || ''),
      priority: Number(record.priority || 10),
      service: String(data.service || '_sip'),
      protocol: String(data.proto || '_tcp'),
      weight: Number(data.weight || 10),
      port: Number(data.port || 5060),
      target: String(data.target || ''),
      flags: Number(data.flags || 0),
      tag: String(data.tag || 'issue'),
      value: String(data.value || ''),
    })
    setShowRecordModal(true)
  }

  function dnsPayloadFromForm(current: DnsFormState): CloudflareDnsRecordInput {
    const payload: CloudflareDnsRecordInput = {
      type: current.type,
      name: current.name,
      ttl: current.proxied ? 1 : current.ttl,
      proxied: current.type === 'A' || current.type === 'AAAA' || current.type === 'CNAME' ? current.proxied : undefined,
      comment: current.comment || undefined,
    }

    if (current.type === 'A' || current.type === 'AAAA' || current.type === 'CNAME' || current.type === 'TXT' || current.type === 'NS') {
      payload.content = current.content
    }

    if (current.type === 'MX') {
      payload.content = current.content
      payload.priority = current.priority
    }

    if (current.type === 'SRV') {
      payload.data = {
        service: current.service,
        proto: current.protocol,
        name: current.name,
        priority: current.priority,
        weight: current.weight,
        port: current.port,
        target: current.target,
      }
    }

    if (current.type === 'CAA') {
      payload.data = {
        flags: current.flags,
        tag: current.tag,
        value: current.value,
      }
    }

    return payload
  }

  async function saveRecord() {
    if (!selectedZoneId) return
    setBusy('dns-save')
    setError(null)
    try {
      const payload = dnsPayloadFromForm(form)
      if (editingRecord) {
        await cf.updateDnsRecord(selectedZoneId, editingRecord.id, payload)
        setToast('DNS record updated')
      } else {
        await cf.createDnsRecord(selectedZoneId, payload)
        setToast('DNS record created')
      }
      setShowRecordModal(false)
      await loadDns()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save DNS record')
    } finally {
      setBusy(null)
    }
  }

  async function deleteRecord(recordId: string) {
    if (!selectedZoneId) return
    if (!confirm('Delete this DNS record?')) return
    setBusy(`dns-delete:${recordId}`)
    setError(null)
    try {
      await cf.deleteDnsRecord(selectedZoneId, recordId)
      setToast('DNS record deleted')
      await loadDns()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete DNS record')
    } finally {
      setBusy(null)
    }
  }

  function settingValue(key: keyof CloudflareZoneSettings): string {
    const item = settings?.[key]
    if (!item || typeof item !== 'object') return ''
    const value = item.value
    return typeof value === 'string' ? value : String(value ?? '')
  }

  async function patchSetting(setting: string, body: { value?: unknown; enabled?: boolean }) {
    if (!selectedZoneId) return
    setBusy(`setting:${setting}`)
    setError(null)
    try {
      await cf.patchSetting(selectedZoneId, setting, body)
      setToast('Setting saved')
      await loadSettings()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'zones', label: 'Zones' },
    { id: 'dns', label: 'DNS Records' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' },
    { id: 'security', label: 'Security' },
  ]

  const statusBadge = (zone: CloudflareZone) => {
    const status = zone.status.toLowerCase()
    if (status === 'active' && !zone.paused) return 'bg-green-900/30 text-green-300'
    if (status === 'paused' || zone.paused) return 'bg-yellow-900/30 text-yellow-300'
    if (status === 'pending') return 'bg-orange-900/30 text-orange-300'
    return 'bg-red-900/30 text-red-300'
  }

  const chartData = useMemo(() => {
    if (!analytics) return []
    return [
      { label: 'Requests', value: analytics.requests },
      { label: 'Bandwidth', value: analytics.bandwidth },
      { label: 'Threats', value: analytics.threats },
      { label: 'Page Views', value: analytics.page_views },
    ]
  }, [analytics])

  const cacheSplit = useMemo(() => {
    if (!analytics) return []
    return [
      { name: 'Cached', value: analytics.cached_requests },
      { name: 'Uncached', value: analytics.uncached_requests },
    ]
  }, [analytics])

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Cloudflare</h2>
        </div>
        <button className="btn-ghost text-xs gap-1.5" onClick={() => loadZones()} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {toast && <div className="text-xs rounded border border-green-800/40 bg-green-900/20 text-green-300 px-3 py-2">{toast}</div>}

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="card p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="text-xs text-muted">Selected Zone</div>
        <select
          className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm"
          value={selectedZoneId}
          onChange={(e) => setSelectedZoneId(e.target.value)}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 border-b border-surface-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted" /></div>
      ) : (
        <>
          {tab === 'zones' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {zones.map((zone) => (
                <div key={zone.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-100">{zone.name}</div>
                      <div className="text-xs text-muted">Plan: {zone.plan}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${statusBadge(zone)}`}>{zone.status}</span>
                  </div>

                  <div className="text-xs text-muted">Nameservers: {(zone.nameservers || []).join(', ') || 'n/a'}</div>

                  <div className="flex items-center gap-2">
                    {zone.paused || zone.status === 'paused' ? (
                      <button
                        className="btn-primary text-xs"
                        onClick={() => zoneAction('unpause', zone.id)}
                        disabled={busy === `unpause:${zone.id}`}
                      >
                        {busy === `unpause:${zone.id}` ? 'Working...' : 'Unpause'}
                      </button>
                    ) : (
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => zoneAction('pause', zone.id)}
                        disabled={busy === `pause:${zone.id}`}
                      >
                        {busy === `pause:${zone.id}` ? 'Working...' : 'Pause'}
                      </button>
                    )}
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => zoneAction('purge', zone.id)}
                      disabled={busy === `purge:${zone.id}`}
                    >
                      <Flame className="w-3.5 h-3.5 inline mr-1" />
                      {busy === `purge:${zone.id}` ? 'Purging...' : 'Purge Cache'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'dns' && (
            <div className="space-y-3">
              <div className="card p-3 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                <div className="flex gap-2 items-center">
                  <select className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={dnsTypeFilter} onChange={(e) => setDnsTypeFilter(e.target.value)}>
                    <option value="">All types</option>
                    {DNS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm"
                    placeholder="Filter by name"
                    value={dnsNameFilter}
                    onChange={(e) => setDnsNameFilter(e.target.value)}
                  />
                  <button className="btn-ghost text-xs" onClick={() => loadDns()}>Apply</button>
                </div>
                <button className="btn-primary text-xs" onClick={openCreateModal}><Plus className="w-3.5 h-3.5 inline mr-1" />Add Record</button>
              </div>

              <div className="card overflow-auto">
                <table className="w-full text-xs min-w-[980px]">
                  <thead>
                    <tr className="border-b border-surface-4 text-muted">
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Content</th>
                      <th className="px-3 py-2 text-left font-medium">TTL</th>
                      <th className="px-3 py-2 text-left font-medium">Proxied</th>
                      <th className="px-3 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dnsRecords.map((record) => (
                      <tr key={record.id} className="border-b border-surface-4/60">
                        <td className="px-3 py-2 font-mono">{record.type}</td>
                        <td className="px-3 py-2">{record.name}</td>
                        <td className="px-3 py-2 max-w-[380px] truncate" title={record.content}>{record.content || JSON.stringify(record.data || {})}</td>
                        <td className="px-3 py-2">{record.ttl}</td>
                        <td className="px-3 py-2">{record.proxied ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 flex items-center gap-2">
                          <button className="btn-ghost text-xs" onClick={() => openEditModal(record)}><Pencil className="w-3.5 h-3.5 inline" /></button>
                          <button className="btn-ghost text-xs text-red-400" onClick={() => deleteRecord(record.id)} disabled={busy === `dns-delete:${record.id}`}><Trash2 className="w-3.5 h-3.5 inline" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-3">
              <div className="card p-3 flex items-center justify-between">
                <div className="flex gap-2">
                  {(['24h', '7d', '30d'] as Range[]).map((r) => (
                    <button
                      key={r}
                      className={`px-3 py-1.5 rounded text-xs ${analyticsRange === r ? 'bg-accent text-black' : 'bg-surface-3 text-gray-200'}`}
                      onClick={() => setAnalyticsRange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {selectedZone && <div className="text-xs text-muted">{selectedZone.name}</div>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Requests" value={analytics?.requests ?? 0} />
                <MetricCard label="Bandwidth" value={analytics?.bandwidth ?? 0} />
                <MetricCard label="Threats" value={analytics?.threats ?? 0} danger />
                <MetricCard label="Page Views" value={analytics?.page_views ?? 0} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="card p-4">
                  <div className="text-sm font-medium mb-3">Traffic Overview</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                        <XAxis dataKey="label" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip />
                        <Bar dataKey="value" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="text-sm font-medium mb-3">Cached vs Uncached</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={cacheSplit} dataKey="value" nameKey="name" outerRadius={95} label>
                          {cacheSplit.map((_, i) => <Cell key={i} fill={i === 0 ? '#22c55e' : '#f59e0b'} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card p-4 space-y-2">
                <div className="text-sm font-medium">SSL/TLS Mode</div>
                <select
                  className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm w-full"
                  value={settingValue('ssl')}
                  onChange={(e) => patchSetting('ssl', { value: e.target.value })}
                  disabled={busy === 'setting:ssl'}
                >
                  <option value="off">off</option>
                  <option value="flexible">flexible</option>
                  <option value="full">full</option>
                  <option value="strict">strict</option>
                </select>
              </div>

              <div className="card p-4 space-y-2">
                <div className="text-sm font-medium">Security Level</div>
                <select
                  className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm w-full"
                  value={settingValue('security_level')}
                  onChange={(e) => patchSetting('security_level', { value: e.target.value })}
                  disabled={busy === 'setting:security_level'}
                >
                  <option value="essentially_off">essentially_off</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="under_attack">under_attack</option>
                </select>
              </div>

              <div className="card p-4 space-y-2">
                <div className="text-sm font-medium">Cache Level</div>
                <select
                  className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm w-full"
                  value={settingValue('cache_level')}
                  onChange={(e) => patchSetting('cache_level', { value: e.target.value })}
                  disabled={busy === 'setting:cache_level'}
                >
                  <option value="basic">basic</option>
                  <option value="simplified">simplified</option>
                  <option value="aggressive">aggressive</option>
                </select>
              </div>

              <ToggleSettingCard
                title="Always Use HTTPS"
                checked={settingValue('always_use_https') === 'on'}
                onChange={(checked) => patchSetting('always_use_https', { value: checked ? 'on' : 'off' })}
                disabled={busy === 'setting:always_use_https'}
              />

              <ToggleSettingCard
                title="Development Mode"
                checked={settingValue('development_mode') === 'on'}
                onChange={(checked) => patchSetting('development_mode', { value: checked ? 'on' : 'off' })}
                disabled={busy === 'setting:development_mode'}
              />
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-3">
              {upgradeRequired && (
                <div className="rounded border border-yellow-800/40 bg-yellow-900/20 text-yellow-300 px-3 py-2 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Firewall rules require a paid Cloudflare plan or broader token scopes.
                </div>
              )}

              {!upgradeRequired && (
                <div className="card overflow-auto">
                  <table className="w-full text-xs min-w-[760px]">
                    <thead>
                      <tr className="border-b border-surface-4 text-muted">
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-left font-medium">Action</th>
                        <th className="px-3 py-2 text-left font-medium">Paused</th>
                        <th className="px-3 py-2 text-left font-medium">Expression</th>
                      </tr>
                    </thead>
                    <tbody>
                      {firewallRules.map((rule) => (
                        <tr key={rule.id} className="border-b border-surface-4/60">
                          <td className="px-3 py-2">{String(rule.description || '—')}</td>
                          <td className="px-3 py-2">{String(rule.action || '—')}</td>
                          <td className="px-3 py-2">{rule.paused ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2 max-w-[380px] truncate">{JSON.stringify(rule.filter || {})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showRecordModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-surface-4 rounded-lg w-full max-w-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{editingRecord ? 'Edit DNS Record' : 'Add DNS Record'}</div>
              <button className="btn-ghost text-xs" onClick={() => setShowRecordModal(false)}>Close</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">Type</label>
              <select className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DnsRecordType })}>
                {DNS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              <label className="text-xs text-muted">Name</label>
              <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

              {(form.type === 'A' || form.type === 'AAAA' || form.type === 'CNAME' || form.type === 'MX' || form.type === 'TXT' || form.type === 'NS') && (
                <>
                  <label className="text-xs text-muted">{form.type === 'CNAME' ? 'Target' : form.type === 'MX' ? 'Mail Server' : 'Content'}</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
                </>
              )}

              {(form.type === 'A' || form.type === 'AAAA' || form.type === 'CNAME') && (
                <>
                  <label className="text-xs text-muted">Proxied</label>
                  <input
                    type="checkbox"
                    checked={form.proxied}
                    onChange={(e) => setForm({ ...form, proxied: e.target.checked, ttl: e.target.checked ? 1 : form.ttl || 300 })}
                  />
                </>
              )}

              <label className="text-xs text-muted">TTL</label>
              <input
                type="number"
                className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm"
                value={form.proxied ? 1 : form.ttl}
                disabled={form.proxied}
                onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })}
              />

              {form.type === 'MX' && (
                <>
                  <label className="text-xs text-muted">Priority</label>
                  <input type="number" className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                </>
              )}

              {form.type === 'SRV' && (
                <>
                  <label className="text-xs text-muted">Service</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
                  <label className="text-xs text-muted">Protocol</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} />
                  <label className="text-xs text-muted">Priority</label>
                  <input type="number" className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                  <label className="text-xs text-muted">Weight</label>
                  <input type="number" className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
                  <label className="text-xs text-muted">Port</label>
                  <input type="number" className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
                  <label className="text-xs text-muted">Target</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
                </>
              )}

              {form.type === 'CAA' && (
                <>
                  <label className="text-xs text-muted">Flags</label>
                  <input type="number" className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.flags} onChange={(e) => setForm({ ...form, flags: Number(e.target.value) })} />
                  <label className="text-xs text-muted">Tag</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
                  <label className="text-xs text-muted">Value</label>
                  <input className="bg-surface-3 border border-surface-4 rounded px-2 py-1.5 text-sm" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-xs" onClick={() => setShowRecordModal(false)}>Cancel</button>
              <button className="btn-primary text-xs" onClick={saveRecord} disabled={busy === 'dns-save'}>
                {busy === 'dns-save' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`font-mono text-lg ${danger ? 'text-red-300' : 'text-gray-100'}`}>{value.toLocaleString()}</div>
    </div>
  )
}

function ToggleSettingCard({
  title,
  checked,
  onChange,
  disabled,
}: {
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-muted" />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <label className="inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className={`w-10 h-6 rounded-full transition ${checked ? 'bg-green-500' : 'bg-surface-4'} relative`}>
          <span className={`absolute top-0.5 transition-all w-5 h-5 bg-white rounded-full ${checked ? 'left-4.5' : 'left-0.5'}`} />
        </span>
      </label>
    </div>
  )
}
