import { useEffect, useState } from 'react'
import { api, PatchPanelLink } from '../../api/client'

export function PatchPanelView({ instanceId = 'default' }: { instanceId?: string }) {
  const patchApi = api.patchPanel(instanceId)
  const [items, setItems] = useState<PatchPanelLink[]>([])
  const [panel, setPanel] = useState('rack-a')
  const [panelPort, setPanelPort] = useState('1')
  const [device, setDevice] = useState('switch-01')
  const [devicePort, setDevicePort] = useState('Gi0/1')
  const [notes, setNotes] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'visual'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  async function load() {
    const data = await patchApi.list()
    setItems(data.items)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function add() {
    if (editingId) {
      await patchApi.update(editingId, { panel, panel_port: panelPort, device, device_port: devicePort, notes })
      setEditingId(null)
    } else {
      await patchApi.create({ panel, panel_port: panelPort, device, device_port: devicePort, notes })
      setPanelPort(String(Number(panelPort) + 1))
    }
    await load()
    resetForm()
  }

  async function deleteLink(id: number) {
    await patchApi.remove(id)
    await load()
    setDeleteConfirm(null)
  }

  function editLink(item: PatchPanelLink) {
    setPanel(item.panel)
    setPanelPort(item.panel_port)
    setDevice(item.device)
    setDevicePort(item.device_port)
    setNotes(item.notes || '')
    setEditingId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setPanel('rack-a')
    setPanelPort('1')
    setDevice('switch-01')
    setDevicePort('Gi0/1')
    setNotes('')
    setEditingId(null)
  }

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase()
    return (
      item.panel.toLowerCase().includes(q) ||
      item.panel_port.toLowerCase().includes(q) ||
      item.device.toLowerCase().includes(q) ||
      item.device_port.toLowerCase().includes(q) ||
      (item.notes && item.notes.toLowerCase().includes(q))
    )
  })

  const uniquePanels = Array.from(new Set(items.map((i) => i.panel))).sort()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Patch Panel Mapping</h2>
        <div className="flex gap-2">
          <button
            className={`text-xs px-3 py-1 rounded ${
              viewMode === 'list' ? 'bg-primary text-white' : 'bg-surface-2 hover:bg-surface-3'
            }`}
            onClick={() => setViewMode('list')}
          >
            📋 List
          </button>
          <button
            className={`text-xs px-3 py-1 rounded ${
              viewMode === 'visual' ? 'bg-primary text-white' : 'bg-surface-2 hover:bg-surface-3'
            }`}
            onClick={() => setViewMode('visual')}
          >
            🎨 Visual
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="p-4 bg-surface-1 rounded border border-surface-3 space-y-3">
        {editingId && (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded p-2 text-xs flex items-center justify-between">
            <span>✏️ Editing link</span>
            <button className="text-blue-200 hover:underline" onClick={resetForm}>
              Cancel
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input 
            className="input text-sm" 
            value={panel} 
            onChange={(e) => setPanel(e.target.value)} 
            placeholder="Panel (rack-a)" 
          />
          <input 
            className="input text-sm" 
            value={panelPort} 
            onChange={(e) => setPanelPort(e.target.value)} 
            placeholder="Port (1)" 
          />
          <input 
            className="input text-sm" 
            value={device} 
            onChange={(e) => setDevice(e.target.value)} 
            placeholder="Device (switch-01)" 
          />
          <input 
            className="input text-sm" 
            value={devicePort} 
            onChange={(e) => setDevicePort(e.target.value)} 
            placeholder="Port (Gi0/1)" 
          />
        </div>
        <input 
          className="input w-full text-sm" 
          value={notes} 
          onChange={(e) => setNotes(e.target.value)} 
          placeholder="Notes (optional): cable color, purpose, VLAN..." 
        />
        <button className="btn-primary text-sm" onClick={add}>
          {editingId ? '💾 Save Changes' : '➕ Add Link'}
        </button>
      </div>

      {/* Search */}
      {items.length > 0 && (
        <input
          className="input w-full text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search by panel, port, device, notes..."
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">
              {items.length === 0 ? 'No links configured yet' : 'No matches found'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 bg-surface-2 rounded hover:bg-surface-3 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-mono text-sm flex items-center gap-2">
                      <span className="text-blue-300">{item.panel}:{item.panel_port}</span>
                      <span className="text-muted">⟶</span>
                      <span className="text-green-300">{item.device}:{item.device_port}</span>
                    </div>
                    {item.notes && (
                      <div className="text-xs text-muted mt-1">💬 {item.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="p-1.5 px-2.5 text-xs bg-surface-3 hover:bg-surface-4 rounded transition-colors"
                      onClick={() => editLink(item)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="p-1.5 px-2.5 text-xs bg-red-900/30 hover:bg-red-900/50 rounded transition-colors"
                      onClick={() => setDeleteConfirm(item.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Visual View */}
      {viewMode === 'visual' && (
        <div className="space-y-6">
          {uniquePanels.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">No panels to display</div>
          ) : (
            uniquePanels.map((panelName) => {
              const panelLinks = items.filter((i) => i.panel === panelName)
              const maxPort = Math.max(...panelLinks.map((i) => Number(i.panel_port) || 0), 24)
              const portCount = Math.ceil(maxPort / 24) * 24 // Round to nearest 24

              return (
                <div key={panelName} className="bg-surface-1 rounded border border-surface-3 p-5">
                  <h3 className="text-sm font-semibold mb-4">📦 {panelName.toUpperCase()}</h3>
                  <div className="grid grid-cols-12 gap-2">
                    {Array.from({ length: portCount }, (_, i) => {
                      const portNum = String(i + 1)
                      const link = panelLinks.find((l) => l.panel_port === portNum)
                      const isUsed = !!link

                      return (
                        <div
                          key={portNum}
                          className={`relative aspect-square rounded border-2 text-center flex items-center justify-center text-[10px] font-mono cursor-pointer transition-all ${
                            isUsed
                              ? 'bg-green-900/30 border-green-500/50 hover:bg-green-900/50 hover:scale-105'
                              : 'bg-surface-2 border-surface-4 hover:bg-surface-3'
                          }`}
                          onClick={() => link && editLink(link)}
                          title={
                            link
                              ? `Port ${portNum} → ${link.device}:${link.device_port}${
                                  link.notes ? `\n💬 ${link.notes}` : ''
                                }`
                              : `Port ${portNum} - Available`
                          }
                        >
                          <span className={isUsed ? 'text-green-200 font-semibold' : 'text-muted'}>{portNum}</span>
                          {isUsed && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex gap-6 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-900/30 border-2 border-green-500/50 rounded"></div>
                      <span className="text-green-200">Used ({panelLinks.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-surface-2 border-2 border-surface-4 rounded"></div>
                      <span className="text-muted">Available ({portCount - panelLinks.length})</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-surface-2 border border-surface-3 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-3">🗑️ Delete Link</h3>
            <p className="text-sm text-muted mb-6">
              Are you sure you want to delete this patch panel link? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-secondary text-sm"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                onClick={() => deleteLink(deleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
