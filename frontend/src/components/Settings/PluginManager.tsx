import { useEffect, useState } from 'react'
import { usePluginStore } from '../../store/pluginStore'
import { PluginConfigForm } from './PluginConfigForm'
import { PluginIcon } from '../PluginIcon'
import { PluginDetail, PluginListItem } from '../../api/client'
import { X, Loader2, CheckCircle2, XCircle, AlertCircle, Plus, Trash2 } from 'lucide-react'

const CATEGORIES = [
  'all', 'virtualization', 'containers', 'monitoring', 'network', 'storage', 'media', 'arr', 'security', 'automation',
]

type ConfigModalState = {
  plugin: PluginDetail
  mode: 'enable' | 'config'
  instanceId: string
  instanceLabel: string
}

type AddInstanceModalState = {
  pluginId: string
  displayName: string
  icon: string
  configSchema: PluginDetail['config_schema'] | null
}

export function PluginManager() {
  const { plugins, fetchPlugins, enablePlugin, disablePlugin, updateConfig, clearPlugin, getPluginDetail, deleteInstance, createInstance } = usePluginStore()
  const [filterCat, setFilterCat] = useState('all')
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all')

  const [configModal, setConfigModal] = useState<ConfigModalState | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  const [addModal, setAddModal] = useState<AddInstanceModalState | null>(null)
  const [addInstanceId, setAddInstanceId] = useState('')
  const [addInstanceLabel, setAddInstanceLabel] = useState('')
  const [addModalLoading, setAddModalLoading] = useState(false)
  const [addModalError, setAddModalError] = useState('')

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  // Group plugins by plugin_id; keep one entry per unique plugin_id for catalog display
  // The "instances" list is the enabled instances for that plugin_id
  type PluginGroup = {
    plugin_id: string
    display_name: string
    description: string
    category: string
    version: string
    icon: string
    hasEnabled: boolean
    instances: PluginListItem[]
  }

  const pluginGroups: PluginGroup[] = (() => {
    const map = new Map<string, PluginGroup>()
    for (const p of plugins) {
      if (!map.has(p.plugin_id)) {
        map.set(p.plugin_id, {
          plugin_id: p.plugin_id,
          display_name: p.display_name,
          description: p.description,
          category: p.category,
          version: p.version,
          icon: p.icon,
          hasEnabled: false,
          instances: [],
        })
      }
      const grp = map.get(p.plugin_id)!
      if (p.enabled) {
        grp.hasEnabled = true
        grp.instances.push(p)
      }
    }
    return Array.from(map.values())
  })()

  const filtered = pluginGroups.filter((g) => {
    if (filterCat !== 'all' && g.category !== filterCat) return false
    if (filterEnabled === 'enabled' && !g.hasEnabled) return false
    if (filterEnabled === 'disabled' && g.hasEnabled) return false
    return true
  })

  async function openConfig(pluginId: string, instanceId: string, mode: 'enable' | 'config') {
    setModalError('')
    const detail = await getPluginDetail(pluginId, instanceId)
    const existingLabel = plugins.find((p) => p.plugin_id === pluginId && p.instance_id === instanceId)?.instance_label ?? ''
    setConfigModal({ plugin: detail, mode, instanceId, instanceLabel: existingLabel })
  }

  async function handleDisable(pluginId: string, instanceId: string) {
    const key = `${pluginId}:${instanceId}`
    setActionLoading(key)
    try {
      await disablePlugin(pluginId, instanceId)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(pluginId: string, instanceId: string) {
    if (!window.confirm(`Delete instance "${instanceId}" of ${pluginId}? This cannot be undone.`)) return
    const key = `${pluginId}:${instanceId}`
    setActionLoading(key)
    try {
      await deleteInstance(pluginId, instanceId)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleClear() {
    if (!configModal) return
    if (!window.confirm(`Clear all settings for this instance? This will disable it.`)) return
    setModalLoading(true)
    setModalError('')
    try {
      await clearPlugin(configModal.plugin.plugin_id, configModal.instanceId)
      setConfigModal(null)
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to clear settings')
    } finally {
      setModalLoading(false)
    }
  }

  async function handleConfigSubmit(values: Record<string, unknown>) {
    if (!configModal) return
    setModalLoading(true)
    setModalError('')
    const label = configModal.instanceLabel.trim() || undefined
    try {
      if (configModal.mode === 'enable') {
        await enablePlugin(configModal.plugin.plugin_id, values, configModal.instanceId, label)
      } else {
        await updateConfig(configModal.plugin.plugin_id, values, configModal.instanceId, label)
      }
      setConfigModal(null)
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save config')
    } finally {
      setModalLoading(false)
    }
  }

  function openAddInstance(grp: PluginGroup) {
    setAddInstanceId('')
    setAddInstanceLabel('')
    setAddModalError('')
    setAddModal({
      pluginId: grp.plugin_id,
      displayName: grp.display_name,
      icon: grp.icon,
      configSchema: null,  // will be loaded
    })
    // Load config schema
    getPluginDetail(grp.plugin_id, 'default').then((detail) => {
      setAddModal((prev) => prev ? { ...prev, configSchema: detail.config_schema } : null)
    })
  }

  async function handleAddInstance(config: Record<string, unknown>) {
    if (!addModal) return
    const id = addInstanceId.trim()
    if (!id) { setAddModalError('Instance ID is required'); return }
    if (!/^[a-z0-9-]+$/.test(id)) { setAddModalError('Instance ID must be lowercase letters, numbers, and hyphens only'); return }
    setAddModalLoading(true)
    setAddModalError('')
    try {
      await createInstance(addModal.pluginId, id, addInstanceLabel.trim() || id, config)
      setAddModal(null)
    } catch (err: unknown) {
      setAddModalError(err instanceof Error ? err.message : 'Failed to create instance')
    } finally {
      setAddModalLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${
                filterCat === cat
                  ? 'bg-accent-dim text-white'
                  : 'bg-surface-3 text-muted hover:text-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {(['all', 'enabled', 'disabled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterEnabled(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${
                filterEnabled === f
                  ? 'bg-surface-4 text-gray-100'
                  : 'text-muted hover:text-gray-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">No plugins match the current filter.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((grp) => (
            <div key={grp.plugin_id} className="card p-4 flex flex-col gap-3">
              {/* Plugin header */}
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded bg-surface-3 flex items-center justify-center flex-shrink-0">
                  <PluginIcon name={grp.icon} className="w-4 h-4 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-100 truncate">{grp.display_name}</span>
                  </div>
                  <p className="text-xs text-muted truncate">{grp.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="badge bg-surface-4 text-muted capitalize">{grp.category}</span>
                    <span className="text-[10px] text-muted/60">v{grp.version}</span>
                  </div>
                </div>
                {!grp.hasEnabled && (
                  <button
                    onClick={() => openConfig(grp.plugin_id, 'default', 'enable')}
                    className="btn-primary text-xs py-1 self-start flex-shrink-0"
                  >
                    Enable
                  </button>
                )}
              </div>

              {/* Instances list */}
              {grp.instances.length > 0 && (
                <div className="border-t border-surface-4 pt-2 space-y-1.5">
                  {grp.instances.map((inst) => {
                    const key = `${inst.plugin_id}:${inst.instance_id}`
                    const label = inst.instance_label || inst.instance_id
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <HealthBadge status={inst.health_status} />
                        <span className="text-xs text-gray-300 flex-1 truncate" title={label}>
                          {label}
                          {inst.instance_id !== 'default' && (
                            <span className="text-muted ml-1 text-[10px]">({inst.instance_id})</span>
                          )}
                        </span>
                        <button
                          onClick={() => openConfig(inst.plugin_id, inst.instance_id, 'config')}
                          className="btn-ghost text-[11px] py-0.5 px-2"
                        >
                          Configure
                        </button>
                        <button
                          onClick={() => handleDisable(inst.plugin_id, inst.instance_id)}
                          disabled={actionLoading === key}
                          className="btn-danger text-[11px] py-0.5 px-2"
                        >
                          {actionLoading === key ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disable'}
                        </button>
                        {inst.instance_id !== 'default' && (
                          <button
                            onClick={() => handleDelete(inst.plugin_id, inst.instance_id)}
                            disabled={actionLoading === key}
                            className="text-muted hover:text-danger transition-colors p-1"
                            title="Delete instance"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Add instance button */}
                  <button
                    onClick={() => openAddInstance(grp)}
                    className="flex items-center gap-1 text-[11px] text-muted hover:text-accent transition-colors mt-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add instance
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Configure/Enable Modal */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <PluginIcon name={configModal.plugin.icon} className="w-4 h-4 text-muted" />
                <span className="text-sm font-semibold text-white">
                  {configModal.mode === 'enable' ? 'Enable' : 'Configure'} {configModal.plugin.display_name}
                  {configModal.instanceId !== 'default' && (
                    <span className="text-muted font-normal ml-1">({configModal.instanceId})</span>
                  )}
                </span>
              </div>
              <button onClick={() => setConfigModal(null)} className="text-muted hover:text-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
                  {modalError}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-xs text-muted mb-1">Display Label</label>
                <input
                  type="text"
                  value={configModal.instanceLabel}
                  onChange={(e) => setConfigModal((prev) => prev ? { ...prev, instanceLabel: e.target.value } : null)}
                  placeholder={configModal.instanceId === 'default' ? 'e.g. Home Lab, Production' : configModal.instanceId}
                  className="input w-full text-sm"
                />
                <p className="text-[10px] text-muted mt-1">Optional name shown in the UI instead of "{configModal.instanceId}".</p>
              </div>
              {Object.keys(configModal.plugin.config_schema?.properties ?? {}).length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted">This plugin requires no configuration.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setConfigModal(null)} className="btn-ghost">Cancel</button>
                    <button onClick={() => handleConfigSubmit({})} disabled={modalLoading} className="btn-primary">
                      {modalLoading ? 'Enabling…' : 'Enable'}
                    </button>
                  </div>
                </div>
              ) : (
                <PluginConfigForm
                  schema={configModal.plugin.config_schema as any}
                  initialValues={configModal.plugin.config ?? {}}
                  onSubmit={handleConfigSubmit}
                  onCancel={() => setConfigModal(null)}
                  onClear={configModal.mode === 'config' ? handleClear : undefined}
                  loading={modalLoading}
                  submitLabel={configModal.mode === 'enable' ? 'Enable' : 'Save'}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Instance Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <PluginIcon name={addModal.icon} className="w-4 h-4 text-muted" />
                <span className="text-sm font-semibold text-white">
                  Add {addModal.displayName} Instance
                </span>
              </div>
              <button onClick={() => setAddModal(null)} className="text-muted hover:text-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3 overflow-y-auto flex-1">
              {addModalError && (
                <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
                  {addModalError}
                </div>
              )}
              <div>
                <label className="block text-xs text-muted mb-1">Instance ID <span className="text-danger">*</span></label>
                <input
                  type="text"
                  value={addInstanceId}
                  onChange={(e) => setAddInstanceId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. home, work, us-east"
                  className="input w-full text-sm"
                />
                <p className="text-[10px] text-muted mt-1">Lowercase letters, numbers, hyphens. Used in URLs.</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Display Label</label>
                <input
                  type="text"
                  value={addInstanceLabel}
                  onChange={(e) => setAddInstanceLabel(e.target.value)}
                  placeholder="e.g. Home Network, Work Office"
                  className="input w-full text-sm"
                />
              </div>

              {addModal.configSchema === null ? (
                <div className="flex items-center gap-2 text-muted text-sm py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading config schema…
                </div>
              ) : (
                <PluginConfigForm
                  schema={addModal.configSchema as any}
                  initialValues={{}}
                  onSubmit={handleAddInstance}
                  onCancel={() => setAddModal(null)}
                  loading={addModalLoading}
                  submitLabel="Add Instance"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HealthBadge({ status }: { status: string | null }) {
  if (!status) return <span className="w-3.5 h-3.5 flex-shrink-0" />
  if (status === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
  if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
  return <AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
}
