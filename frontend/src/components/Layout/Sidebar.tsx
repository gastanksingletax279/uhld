import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePluginStore } from '../../store/pluginStore'
import { Server, LayoutDashboard, Settings, Puzzle, GripVertical, Pencil, Check } from 'lucide-react'
import { PluginIcon } from '../PluginIcon'
import type { PluginListItem } from '../../api/client'

// ── Persist sidebar order in localStorage ─────────────────────────────────────

const SIDEBAR_ORDER_KEY = 'sidebar_order'

const CATEGORY_ORDER = [
  'virtualization', 'containers', 'monitoring', 'network', 'storage', 'infrastructure', 'media', 'arr', 'security', 'automation', 'other',
]

function loadSidebarOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY) ?? '[]') } catch { return [] }
}

function saveSidebarOrder(ids: string[]) {
  localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(ids))
}

function applySidebarOrder(plugins: PluginListItem[], order: string[]): PluginListItem[] {
  const key = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
  if (order.length === 0) {
    // Default: sort by category order
    return [...plugins].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category || 'other')
      const bi = CATEGORY_ORDER.indexOf(b.category || 'other')
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }
  const map = Object.fromEntries(plugins.map((p) => [key(p), p]))
  const ordered = order.filter((id) => map[id]).map((id) => map[id])
  const extra = plugins.filter((p) => !order.includes(key(p)))
  return [...ordered, ...extra]
}

// ── Sortable plugin nav item ───────────────────────────────────────────────────

function SortableNavItem({
  plugin,
  instanceCount,
  editing,
}: {
  plugin: PluginListItem
  instanceCount: number
  editing: boolean
}) {
  const instanceKey = `${plugin.plugin_id}:${plugin.instance_id}`
  const viewPath =
    plugin.instance_id === 'default'
      ? `/plugins/${plugin.plugin_id}`
      : `/plugins/${plugin.plugin_id}/${plugin.instance_id}`

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instanceKey,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const label =
    instanceCount > 1
      ? `${plugin.display_name} — ${plugin.instance_label || plugin.instance_id}`
      : plugin.display_name

  return (
    <div ref={setNodeRef} style={style} className="flex items-center mx-1">
      {/* Drag handle — only visible in editing mode */}
      <div
        {...attributes}
        {...listeners}
        className={`p-1 rounded flex-shrink-0 transition-colors ${
          editing
            ? 'cursor-grab active:cursor-grabbing text-muted/60 hover:text-muted'
            : 'pointer-events-none text-transparent'
        }`}
        title={editing ? 'Drag to reorder' : undefined}
      >
        <GripVertical className="w-3 h-3" />
      </div>

      <NavLink
        to={viewPath}
        end
        className={({ isActive }) =>
          `flex-1 flex items-center gap-2 py-1.5 pr-2 rounded transition-colors min-w-0 ${
            isActive
              ? 'bg-accent-dim/20 text-accent'
              : 'text-gray-400 hover:text-gray-100 hover:bg-surface-3'
          }`
        }
      >
        <span className="flex-shrink-0">
          <PluginIcon name={plugin.icon} className="w-4 h-4" />
        </span>
        <span className="flex-1 truncate text-sm">{label}</span>
        {plugin.health_status === 'error' && (
          <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" title="Error" />
        )}
        {plugin.health_status === 'ok' && (
          <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
        )}
      </NavLink>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { plugins, fetchPlugins } = usePluginStore()

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  const enabled = plugins.filter((p) => p.enabled)

  const instanceCount: Record<string, number> = {}
  for (const p of enabled) {
    instanceCount[p.plugin_id] = (instanceCount[p.plugin_id] ?? 0) + 1
  }

  const [order, setOrder] = useState<string[]>(loadSidebarOrder)
  const [editing, setEditing] = useState(false)

  // Keep order in sync when the plugin list changes (new plugins appended at bottom)
  useEffect(() => {
    if (enabled.length > 0) {
      const current = loadSidebarOrder()
      const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
      const merged = [
        ...current.filter((id) => enabled.some((p) => keyOf(p) === id)),
        ...enabled.filter((p) => !current.includes(keyOf(p))).map(keyOf),
      ]
      setOrder(merged)
      saveSidebarOrder(merged)
    }
  }, [plugins.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(String(active.id))
        const newIdx = prev.indexOf(String(over.id))
        const next = arrayMove(prev, oldIdx, newIdx)
        saveSidebarOrder(next)
        return next
      })
    }
  }

  const sorted = applySidebarOrder(enabled, order)

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-surface-4 flex flex-col">
      {/* Logo */}
      <Link
        to="/"
        className="flex items-center gap-2.5 px-4 py-3.5 border-b border-surface-4 hover:bg-surface-2 transition-colors"
      >
        <div className="w-7 h-7 bg-accent-dim rounded flex items-center justify-center">
          <Server className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm text-white">UHLD</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 text-sm">
        {/* Dashboard + reorder toggle */}
        <div className="flex items-center mx-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded transition-colors ${
                isActive
                  ? 'bg-accent-dim/20 text-accent'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-surface-3'
              }`
            }
          >
            <span className="flex-shrink-0"><LayoutDashboard className="w-4 h-4" /></span>
            <span className="flex-1 truncate">Dashboard</span>
          </NavLink>
          {sorted.length > 0 && (
            <button
              onClick={() => setEditing((v) => !v)}
              className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                editing
                  ? 'text-accent bg-accent-dim/20 hover:bg-accent-dim/30'
                  : 'text-muted/40 hover:text-muted hover:bg-surface-3'
              }`}
              title={editing ? 'Done reordering' : 'Reorder plugins'}
            >
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Sortable plugin items */}
        {sorted.length > 0 && (
          <div className="mt-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sorted.map((p) => `${p.plugin_id}:${p.instance_id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sorted.map((p) => (
                  <SortableNavItem
                    key={`${p.plugin_id}:${p.instance_id}`}
                    plugin={p}
                    instanceCount={instanceCount[p.plugin_id]}
                    editing={editing}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Bottom links */}
        <div className="mt-3 border-t border-surface-4 pt-2">
          <SidebarLink to="/settings/plugins" icon={<Puzzle className="w-4 h-4" />} label="Plugins" />
          <SidebarLink to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>
      </nav>
    </aside>
  )
}

// ── Static nav link (non-draggable) ───────────────────────────────────────────

function SidebarLink({
  to,
  icon,
  label,
  exact = true,
}: {
  to: string
  icon: React.ReactNode
  label: string
  exact?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-1.5 mx-1 rounded transition-colors ${
          isActive
            ? 'bg-accent-dim/20 text-accent'
            : 'text-gray-400 hover:text-gray-100 hover:bg-surface-3'
        }`
      }
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </NavLink>
  )
}
