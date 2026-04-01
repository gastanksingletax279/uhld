import { useEffect, useState } from 'react'
import { api, TaskIncidentItem, IncidentComment } from '../../api/client'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type Tab = 'board' | 'incidents' | 'all'

const STATUS_STATES: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-900/30 text-blue-100 border-blue-700' },
  assigned: { label: 'Assigned', color: 'bg-cyan-900/30 text-cyan-100 border-cyan-700' },
  investigating: { label: 'Investigating', color: 'bg-yellow-900/30 text-yellow-100 border-yellow-700' },
  resolved: { label: 'Resolved', color: 'bg-green-900/30 text-green-100 border-green-700' },
  closed: { label: 'Closed', color: 'bg-gray-900/30 text-gray-100 border-gray-700' },
  open: { label: 'Open', color: 'bg-orange-900/30 text-orange-100 border-orange-700' },
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/30 text-red-100 border-red-700',
  high: 'bg-orange-900/30 text-orange-100 border-orange-700',
  medium: 'bg-yellow-900/30 text-yellow-100 border-yellow-700',
  low: 'bg-green-900/30 text-green-100 border-green-700',
}

const PRIORITY_BADGES: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴',
}

export function TasksIncidentsView({ instanceId = 'default' }: { instanceId?: string }) {
  const taskApi = api.tasksIncidents(instanceId)
  const [tab, setTab] = useState<Tab>('board')
  const [items, setItems] = useState<TaskIncidentItem[]>([])
  const [selectedItem, setSelectedItem] = useState<TaskIncidentItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    kind: 'incident',
    severity: 'medium',
    status: 'new',
    priority: 'medium',
    description: '',
    affected_systems: [] as string[],
    impact: '',
    assignees: [] as string[],
    due_date: '',
  })

  async function load() {
    const data = await taskApi.list()
    setItems(data.items)
    if (selectedItem) {
      const updated = data.items.find((i) => i.id === selectedItem.id)
      if (updated) setSelectedItem(updated)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [])

  async function handleCreate() {
    if (!formData.title.trim()) return
    try {
      setLoading(true)
      await taskApi.create(formData)
      setFormData({
        title: '',
        kind: 'incident',
        severity: 'medium',
        status: 'new',
        priority: 'medium',
        description: '',
        affected_systems: [],
        impact: '',
        assignees: [],
        due_date: '',
      })
      setShowForm(false)
      await load()
    } finally {
      setLoading(false)
    }
  }

  async function handleAddComment() {
    if (!selectedItem || !newComment.trim()) return
    try {
      setLoading(true)
      await taskApi.addComment(selectedItem.id, newComment)
      setNewComment('')
      await load()
    } finally {
      setLoading(false)
    }
  }

  async function updateIncident(updates: Partial<TaskIncidentItem>) {
    if (!selectedItem) return
    try {
      await taskApi.update(selectedItem.id, updates)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteIncident(id: number) {
    try {
      await taskApi.remove(id)
      setSelectedItem(null)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  const statusLabels: Record<string, string> = {
    new: '📋 New',
    assigned: '👤 Assigned',
    investigating: '🔍 Investigating',
    resolved: '✅ Resolved',
    closed: '🔒 Closed',
    open: '🔴 Open',
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const incidentId = Number(active.id)
    const newStatus = String(over.id)

    const incident = items.find((i) => i.id === incidentId)
    if (!incident || incident.status === newStatus) return

    try {
      await taskApi.update(incidentId, { status: newStatus as any })
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  function DraggableIncidentCard({ item }: { item: TaskIncidentItem }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: item.id,
    })

    const style = {
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`w-full text-left text-xs p-2 rounded border cursor-pointer hover:opacity-80 transition ${SEVERITY_COLORS[item.severity || 'low']}`}
      >
        <div className="flex items-start gap-2">
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing text-muted hover:text-white mt-0.5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
          </button>
          <div className="flex-1 min-w-0" onClick={() => setSelectedItem(item)}>
            {item.number && <div className="text-[10px] text-muted mb-0.5">{item.number}</div>}
            <div className="font-semibold truncate">{item.title}</div>
            <div className="flex gap-1 mt-1">
              <span>{PRIORITY_BADGES[item.priority] || '?'}</span>
              {item.assignees?.length ? <span>👤{item.assignees.length}</span> : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function DroppableColumn({ status, children }: { status: string; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({
      id: status,
    })

    return (
      <div
        ref={setNodeRef}
        className={`bg-surface-1 rounded border p-3 transition ${isOver ? 'border-primary bg-surface-2' : 'border-surface-3'}`}
      >
        {children}
      </div>
    )
  }

  const renderKanban = () => {
    const statuses = ['new', 'assigned', 'investigating', 'resolved', 'closed']
    const columns: Record<string, TaskIncidentItem[]> = {}

    statuses.forEach((status) => {
      columns[status] = items.filter((item) => item.status === status && item.kind === 'incident')
    })

    return (
      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {statuses.map((status) => (
            <DroppableColumn key={status} status={status}>
              <div className="text-sm font-semibold mb-3 text-muted">{statusLabels[status]}</div>
              <div className="space-y-2 min-h-96">
                {columns[status].map((item) => (
                  <DraggableIncidentCard key={item.id} item={item} />
                ))}
              </div>
            </DroppableColumn>
          ))}
        </div>
      </DndContext>
    )
  }

  const renderListView = (filterKind?: string) => {
    const filtered = filterKind ? items.filter((i) => i.kind === filterKind) : items
    return (
      <div className="space-y-2 max-h-96 overflow-auto">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className={`w-full text-left text-xs p-3 rounded border cursor-pointer hover:bg-surface-1 transition ${selectedItem?.id === item.id ? 'bg-surface-1 border-primary' : 'border-surface-3'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {item.number && <div className="text-[10px] text-muted mb-1">{item.number}</div>}
                <div className="font-semibold truncate">{item.title}</div>
                <div className="text-muted mt-1">{item.description?.slice(0, 100)}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <span className="text-xs">{PRIORITY_BADGES[item.priority] || '?'}</span>
                <span className={`px-1 py-0.5 rounded text-xs border ${SEVERITY_COLORS[item.severity || 'low']}`}>
                  {item.severity?.toUpperCase() || 'LOW'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className={`px-2 py-1 rounded text-xs border ${STATUS_STATES[item.status]?.color || ''}`}>
                {STATUS_STATES[item.status]?.label || item.status}
              </span>
              {item.due_date && <span className="text-xs text-muted">📅 {new Date(item.due_date).toLocaleDateString()}</span>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="text-xs text-muted text-center py-4">No items</div>}
      </div>
    )
  }

  const renderDetailView = () => {
    if (!selectedItem) return null

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-surface-3">
          <div className="flex-1">
            {selectedItem.number && <div className="text-xs text-muted mb-1">{selectedItem.number}</div>}
            <h3 className="text-lg font-semibold">{selectedItem.title}</h3>
          </div>
          <button
            className="text-sm text-red-400 hover:text-red-300"
            onClick={() => setDeleteConfirm(selectedItem.id)}
          >
            ✕ Delete
          </button>
        </div>

        {/* Status & Severity Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label text-xs">Status</label>
            <select
              className="input"
              value={selectedItem.status}
              onChange={(e) => updateIncident({ status: e.target.value as any })}
            >
              {Object.entries(STATUS_STATES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Severity</label>
            <select
              className="input"
              value={selectedItem.severity || 'medium'}
              onChange={(e) => updateIncident({ severity: e.target.value as any })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Description */}
        {selectedItem.description && (
          <div>
            <label className="label text-xs">Description</label>
            <div className="input bg-surface-2 min-h-[4rem]">{selectedItem.description}</div>
          </div>
        )}

        {/* Impact Statement */}
        {selectedItem.impact && (
          <div>
            <label className="label text-xs">Impact Statement</label>
            <div className="input bg-surface-2 min-h-[3rem]">{selectedItem.impact}</div>
          </div>
        )}

        {/* Affected Systems */}
        {selectedItem.affected_systems?.length ? (
          <div>
            <label className="label text-xs">Affected Systems</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {selectedItem.affected_systems.map((sys) => (
                <span key={sys} className="px-2 py-1 bg-surface-2 border border-surface-3 text-xs rounded">
                  {sys}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Assignees */}
        <div>
          <label className="label text-xs">Assignees</label>
          <input
            className="input"
            placeholder="Add assignee (comma separated)"
            defaultValue={selectedItem.assignees?.join(', ') || ''}
            onBlur={(e) => {
              const assignees = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean)
              updateIncident({ assignees })
            }}
          />
        </div>

        {/* Due Date */}
        <div>
          <label className="label text-xs">Due Date</label>
          <input
            type="date"
            className="input"
            value={selectedItem.due_date?.split('T')[0] || ''}
            onChange={(e) => updateIncident({ due_date: e.target.value })}
          />
        </div>

        {/* Comments Timeline */}
        <div className="pt-4 border-t border-surface-3">
          <label className="label text-xs mb-3">Timeline & Comments</label>
          <div className="space-y-2 max-h-64 overflow-auto mb-4 bg-surface-1 border border-surface-3 p-3 rounded">
            {selectedItem.comments?.length ? (
              selectedItem.comments.map((comment) => (
                <div key={comment.id} className="text-xs border-l-2 border-surface-3 pl-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white">{comment.author}</span>
                    <span className="text-muted">{new Date(comment.timestamp).toLocaleString()}</span>
                    {comment.kind !== 'comment' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 rounded">{comment.kind}</span>
                    )}
                  </div>
                  <div className="text-gray-300">{comment.text}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted text-center py-4">No comments yet</div>
            )}
          </div>

          {/* New Comment */}
          <div className="space-y-2">
            <textarea
              className="input w-full resize-none"
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <button
              className="btn-secondary w-full"
              onClick={handleAddComment}
              disabled={loading || !newComment.trim()}
            >
              {loading ? 'Adding...' : 'Add Comment'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Incident Management</h2>
        <button className="btn-primary text-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-surface-3">
        <button
          onClick={() => setTab('board')}
          className={`px-3 py-2 text-sm border-b-2 ${tab === 'board' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}
        >
          🗂️ Kanban Board
        </button>
        <button
          onClick={() => setTab('incidents')}
          className={`px-3 py-2 text-sm border-b-2 ${tab === 'incidents' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}
        >
          🚨 Incidents
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-3 py-2 text-sm border-b-2 ${tab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted'}`}
        >
          📋 All Items
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'board' && renderKanban()}
        {tab === 'incidents' && renderListView('incident')}
        {tab === 'all' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <div className="overflow-auto">{renderListView()}</div>
            <div className="overflow-auto">{renderDetailView()}</div>
          </div>
        )}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-surface-2 border border-surface-4 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New</h3>
              <button
                className="text-muted hover:text-gray-100 text-xl"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  placeholder="Enter title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input w-full resize-none"
                  placeholder="Describe the incident, task, or request"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select
                    className="input"
                    value={formData.kind}
                    onChange={(e) => setFormData({ ...formData, kind: e.target.value })}
                  >
                    <option value="incident">Incident</option>
                    <option value="task">Task</option>
                    <option value="request">Request</option>
                  </select>
                </div>
                <div>
                  <label className="label">Severity</label>
                  <select
                    className="input"
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Impact Statement</label>
                <textarea
                  className="input w-full resize-none"
                  placeholder="Describe the business impact"
                  rows={2}
                  value={formData.impact}
                  onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Assignees</label>
                <input
                  className="input"
                  placeholder="user1, user2, user3"
                  value={formData.assignees.join(', ')}
                  onChange={(e) => setFormData({ ...formData, assignees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>

              <div>
                <label className="label">Due Date</label>
                <input 
                  type="date" 
                  className="input" 
                  value={formData.due_date} 
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} 
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-surface-3">
                <button 
                  type="button" 
                  className="btn-ghost" 
                  onClick={() => setShowForm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={loading || !formData.title.trim()}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal Overlay */}
      {(tab === 'incidents' || tab === 'board') && selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-surface-2 border border-surface-4 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">
                {selectedItem.kind === 'incident' ? '🚨 Incident Details' : 
                 selectedItem.kind === 'task' ? '📋 Task Details' : '💬 Request Details'}
              </h3>
              <button
                className="text-muted hover:text-gray-100 text-xl"
                onClick={() => setSelectedItem(null)}
              >
                ✕
              </button>
            </div>
            {renderDetailView()}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-surface-2 border border-red-700/50 rounded-lg p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3 text-red-400">🗑️ Delete {items.find(i => i.id === deleteConfirm)?.kind || 'Item'}?</h3>
            <p className="text-sm text-gray-300 mb-2">
              Are you sure you want to delete <strong>"{items.find(i => i.id === deleteConfirm)?.title}"</strong>?
            </p>
            <p className="text-xs text-muted mb-6">
              This action cannot be undone. All comments and timeline history will be permanently lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-ghost"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
                onClick={() => deleteIncident(deleteConfirm)}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
