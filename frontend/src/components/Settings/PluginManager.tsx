import { useEffect, useState } from 'react'
import { usePluginStore } from '../../store/pluginStore'
import { PluginConfigForm } from './PluginConfigForm'
import { PluginIcon } from '../PluginIcon'
import { PluginDetail } from '../../api/client'
import { X, ChevronDown, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

const CATEGORIES = [
  'all', 'virtualization', 'containers', 'monitoring', 'network', 'storage', 'media', 'arr', 'security', 'automation',
]

export function PluginManager() {
  const { plugins, fetchPlugins, enablePlugin, disablePlugin, updateConfig, clearPlugin, getPluginDetail } = usePluginStore()
  const [filterCat, setFilterCat] = useState('all')
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [configModal, setConfigModal] = useState<{ plugin: PluginDetail; mode: 'enable' | 'config' } | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  const filtered = plugins.filter((p) => {
    if (filterCat !== 'all' && p.category !== filterCat) return false
    if (filterEnabled === 'enabled' && !p.enabled) return false
    if (filterEnabled === 'disabled' && p.enabled) return false
    return true
  })

  async function openConfig(pluginId: string, mode: 'enable' | 'config') {
    setModalError('')
    const detail = await getPluginDetail(pluginId)
    setConfigModal({ plugin: detail, mode })
  }

  async function handleDisable(pluginId: string) {
    setActionLoading(pluginId)
    try {
      await disablePlugin(pluginId)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleClear() {
    if (!configModal) return
    if (!window.confirm(`Clear all settings for ${configModal.plugin.display_name}? This will disable the plugin.`)) return
    setModalLoading(true)
    setModalError('')
    try {
      await clearPlugin(configModal.plugin.plugin_id)
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
    try {
      if (configModal.mode === 'enable') {
        await enablePlugin(configModal.plugin.plugin_id, values)
      } else {
        await updateConfig(configModal.plugin.plugin_id, values)
      }
      setConfigModal(null)
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save config')
    } finally {
      setModalLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category filter */}
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
          {filtered.map((plugin) => (
            <div key={plugin.plugin_id} className="card p-4 flex gap-3">
              {/* Icon */}
              <div className="w-9 h-9 rounded bg-surface-3 flex items-center justify-center flex-shrink-0">
                <PluginIcon name={plugin.icon} className="w-4 h-4 text-muted" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-100 truncate">{plugin.display_name}</span>
                  <HealthBadge status={plugin.health_status} />
                </div>
                <p className="text-xs text-muted truncate">{plugin.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="badge bg-surface-4 text-muted capitalize">{plugin.category}</span>
                  <span className="text-[10px] text-muted/60">v{plugin.version}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {plugin.enabled ? (
                  <>
                    <button
                      onClick={() => openConfig(plugin.plugin_id, 'config')}
                      className="btn-ghost text-xs py-1"
                    >
                      Configure
                    </button>
                    <button
                      onClick={() => handleDisable(plugin.plugin_id)}
                      disabled={actionLoading === plugin.plugin_id}
                      className="btn-danger text-xs py-1"
                    >
                      {actionLoading === plugin.plugin_id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disable'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openConfig(plugin.plugin_id, 'enable')}
                    className="btn-primary text-xs py-1"
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Modal */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-lg shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4">
              <div className="flex items-center gap-2">
                <PluginIcon name={configModal.plugin.icon} className="w-4 h-4 text-muted" />
                <span className="text-sm font-semibold text-white">
                  {configModal.mode === 'enable' ? 'Enable' : 'Configure'} {configModal.plugin.display_name}
                </span>
              </div>
              <button onClick={() => setConfigModal(null)} className="text-muted hover:text-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-4 py-4">
              {modalError && (
                <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
                  {modalError}
                </div>
              )}

              {Object.keys(configModal.plugin.config_schema?.properties ?? {}).length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted">This plugin requires no configuration.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setConfigModal(null)} className="btn-ghost">Cancel</button>
                    <button
                      onClick={() => handleConfigSubmit({})}
                      disabled={modalLoading}
                      className="btn-primary"
                    >
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
    </div>
  )
}

function HealthBadge({ status }: { status: string | null }) {
  if (!status) return null
  if (status === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
  if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-danger" />
  return <AlertCircle className="w-3.5 h-3.5 text-warning" />
}
