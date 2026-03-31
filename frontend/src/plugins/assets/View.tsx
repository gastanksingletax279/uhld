import { useEffect, useState } from 'react'
import { api, AssetItem } from '../../api/client'
import { Plus, Pencil, Trash2, RefreshCw, Loader2, AlertCircle, X, Server } from 'lucide-react'

const ASSET_TYPES = [
  { value: 'server',  label: 'Server' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'laptop',  label: 'Laptop' },
  { value: 'switch',  label: 'Switch' },
  { value: 'router',  label: 'Router' },
  { value: 'ap',      label: 'Access Point' },
  { value: 'nas',     label: 'NAS' },
  { value: 'printer', label: 'Printer' },
  { value: 'ups',     label: 'UPS' },
  { value: 'other',   label: 'Other' },
]

type AssetForm = Omit<AssetItem, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: AssetForm = {
  name: '',
  asset_type: 'server',
  role: '',
  manufacturer: '',
  model: '',
  cpu: '',
  cpu_cores: null,
  ram_gb: null,
  storage: '',
  gpu: '',
  os: '',
  ip_address: '',
  notes: '',
}

function nullify(form: AssetForm): AssetForm {
  return {
    ...form,
    role:         form.role?.trim()         || null,
    manufacturer: form.manufacturer?.trim() || null,
    model:        form.model?.trim()        || null,
    cpu:          form.cpu?.trim()          || null,
    storage:      form.storage?.trim()      || null,
    gpu:          form.gpu?.trim()          || null,
    os:           form.os?.trim()           || null,
    ip_address:   form.ip_address?.trim()   || null,
    notes:        form.notes?.trim()        || null,
  }
}

export function AssetsView({ instanceId = 'default' }: { instanceId?: string }) {
  const assetsApi = api.assets(instanceId)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; asset?: AssetItem } | null>(null)
  const [form, setForm] = useState<AssetForm>(EMPTY_FORM)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await assetsApi.list()
      setAssets(data.assets)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm(EMPTY_FORM)
    setModal({ mode: 'add' })
  }

  function openEdit(asset: AssetItem) {
    setForm({
      name:         asset.name,
      asset_type:   asset.asset_type,
      role:         asset.role ?? '',
      manufacturer: asset.manufacturer ?? '',
      model:        asset.model ?? '',
      cpu:          asset.cpu ?? '',
      cpu_cores:    asset.cpu_cores,
      ram_gb:       asset.ram_gb,
      storage:      asset.storage ?? '',
      gpu:          asset.gpu ?? '',
      os:           asset.os ?? '',
      ip_address:   asset.ip_address ?? '',
      notes:        asset.notes ?? '',
    })
    setModal({ mode: 'edit', asset })
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = nullify(form)
      if (modal?.mode === 'edit' && modal.asset) {
        const updated = await assetsApi.update(modal.asset.id, body)
        setAssets((prev) => prev.map((a) => a.id === updated.id ? updated : a))
      } else {
        const created = await assetsApi.create(body)
        setAssets((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setModal(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await assetsApi.remove(deleteTarget.id)
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function field(key: keyof AssetForm, value: string | number | null) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const typeLabel = (t: string) => ASSET_TYPES.find((x) => x.value === t)?.label ?? t

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold">Asset Inventory</h2>
          <span className="text-muted text-sm">({assets.length})</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            Add Asset
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      {loading && assets.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No assets yet</p>
          <p className="text-xs mt-1">Click "Add Asset" to add your first device.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-3 text-muted">
                <th className="text-left pb-2 pr-3 font-medium">Name</th>
                <th className="text-left pb-2 pr-3 font-medium">Type</th>
                <th className="text-left pb-2 pr-3 font-medium">Role</th>
                <th className="text-left pb-2 pr-3 font-medium">Manufacturer / Model</th>
                <th className="text-left pb-2 pr-3 font-medium">CPU</th>
                <th className="text-left pb-2 pr-3 font-medium">RAM</th>
                <th className="text-left pb-2 pr-3 font-medium">Storage</th>
                <th className="text-left pb-2 pr-3 font-medium">OS</th>
                <th className="text-left pb-2 pr-3 font-medium">IP</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-surface-2 hover:bg-surface-2/40">
                  <td className="py-2 pr-3 font-medium text-gray-100">{a.name}</td>
                  <td className="py-2 pr-3">
                    <span className="badge-ok text-[10px]">{typeLabel(a.asset_type)}</span>
                  </td>
                  <td className="py-2 pr-3 text-gray-300">{a.role ?? <span className="text-surface-4">—</span>}</td>
                  <td className="py-2 pr-3 text-gray-300">
                    {[a.manufacturer, a.model].filter(Boolean).join(' ') || <span className="text-surface-4">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-300">
                    {a.cpu
                      ? <span>{a.cpu}{a.cpu_cores ? ` (${a.cpu_cores}c)` : ''}</span>
                      : <span className="text-surface-4">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">
                    {a.ram_gb ? `${a.ram_gb} GB` : <span className="text-surface-4">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-300">{a.storage ?? <span className="text-surface-4">—</span>}</td>
                  <td className="py-2 pr-3 text-gray-300">{a.os ?? <span className="text-surface-4">—</span>}</td>
                  <td className="py-2 pr-3 font-mono text-gray-300">{a.ip_address ?? <span className="text-surface-4">—</span>}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(a)}
                        title="Edit"
                        className="p-1 rounded text-muted hover:text-accent transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(a)}
                        title="Delete"
                        className="p-1 rounded text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-1 border border-surface-3 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 flex-shrink-0">
              <h3 className="font-semibold">{modal.mode === 'add' ? 'Add Asset' : 'Edit Asset'}</h3>
              <button onClick={() => setModal(null)} className="text-muted hover:text-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 text-xs">
              {/* Row 1: Name + Type */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted block mb-1">Name <span className="text-danger">*</span></span>
                  <input
                    className="input w-full"
                    value={form.name}
                    onChange={(e) => field('name', e.target.value)}
                    placeholder="e.g. pve-01"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">Type</span>
                  <select
                    className="input w-full"
                    value={form.asset_type}
                    onChange={(e) => field('asset_type', e.target.value)}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {/* Row 2: Role + IP */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted block mb-1">Role</span>
                  <input
                    className="input w-full"
                    value={form.role ?? ''}
                    onChange={(e) => field('role', e.target.value)}
                    placeholder="e.g. Proxmox host"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">IP Address</span>
                  <input
                    className="input w-full font-mono"
                    value={form.ip_address ?? ''}
                    onChange={(e) => field('ip_address', e.target.value)}
                    placeholder="e.g. 192.168.1.10"
                  />
                </label>
              </div>
              {/* Row 3: Manufacturer + Model */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted block mb-1">Manufacturer</span>
                  <input
                    className="input w-full"
                    value={form.manufacturer ?? ''}
                    onChange={(e) => field('manufacturer', e.target.value)}
                    placeholder="e.g. Dell, HP, Supermicro"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">Model</span>
                  <input
                    className="input w-full"
                    value={form.model ?? ''}
                    onChange={(e) => field('model', e.target.value)}
                    placeholder="e.g. PowerEdge R720"
                  />
                </label>
              </div>
              {/* Row 4: CPU + Cores */}
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="text-muted block mb-1">CPU</span>
                  <input
                    className="input w-full"
                    value={form.cpu ?? ''}
                    onChange={(e) => field('cpu', e.target.value)}
                    placeholder="e.g. Intel Xeon E5-2670"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">Cores</span>
                  <input
                    type="number"
                    min={1}
                    className="input w-full"
                    value={form.cpu_cores ?? ''}
                    onChange={(e) => field('cpu_cores', e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 16"
                  />
                </label>
              </div>
              {/* Row 5: RAM + Storage */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted block mb-1">RAM (GB)</span>
                  <input
                    type="number"
                    min={1}
                    className="input w-full"
                    value={form.ram_gb ?? ''}
                    onChange={(e) => field('ram_gb', e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 64"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">Storage</span>
                  <input
                    className="input w-full"
                    value={form.storage ?? ''}
                    onChange={(e) => field('storage', e.target.value)}
                    placeholder="e.g. 2x 1TB SSD, 4x 4TB HDD"
                  />
                </label>
              </div>
              {/* Row 6: GPU + OS */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted block mb-1">GPU</span>
                  <input
                    className="input w-full"
                    value={form.gpu ?? ''}
                    onChange={(e) => field('gpu', e.target.value)}
                    placeholder="e.g. NVIDIA RTX 3090"
                  />
                </label>
                <label className="block">
                  <span className="text-muted block mb-1">OS / Hypervisor</span>
                  <input
                    className="input w-full"
                    value={form.os ?? ''}
                    onChange={(e) => field('os', e.target.value)}
                    placeholder="e.g. Proxmox VE 8.2"
                  />
                </label>
              </div>
              {/* Notes */}
              <label className="block">
                <span className="text-muted block mb-1">Notes</span>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={(e) => field('notes', e.target.value)}
                  placeholder="Any additional notes..."
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-surface-3 flex-shrink-0">
              <button onClick={() => setModal(null)} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {modal.mode === 'add' ? 'Add Asset' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface-1 border border-surface-3 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Delete asset?</p>
                <p className="text-muted text-xs mt-1">
                  This will permanently delete <span className="text-gray-100 font-medium">{deleteTarget.name}</span>.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-danger text-xs flex items-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
