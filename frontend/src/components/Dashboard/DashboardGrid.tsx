import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { KeyboardSensor } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { usePluginStore } from '../../store/pluginStore'
import { WidgetCard } from './WidgetCard'
import { PluginWidget } from './PluginWidget'
import { Loader2, GripVertical } from 'lucide-react'
import type { PluginListItem, PluginSummary } from '../../api/client'

export interface DashboardGridHandle {
  sortAlpha: () => void
  sortByType: () => void
}

// ── Persist widget order in localStorage ──────────────────────────────────────

const ORDER_KEY = 'widget_order'

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') } catch { return [] }
}

function saveOrder(ids: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
}

function applyOrder(plugins: PluginListItem[], order: string[]): PluginListItem[] {
  if (order.length === 0) return plugins
  const key = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
  const map = Object.fromEntries(plugins.map((p) => [key(p), p]))
  const ordered = order.filter((id) => map[id]).map((id) => map[id])
  const extra = plugins.filter((p) => !order.includes(key(p)))
  return [...ordered, ...extra]
}

// ── Sortable widget wrapper ────────────────────────────────────────────────────

function SortableWidget({
  plugin,
  summary,
  editing,
  isBeingDragged,
  isMultiInstance,
}: {
  plugin: PluginListItem
  summary: PluginSummary | undefined
  editing: boolean
  isBeingDragged: boolean
  isMultiInstance: boolean
}) {
  const instanceKey = `${plugin.plugin_id}:${plugin.instance_id}`
  const viewPath = plugin.instance_id === 'default'
    ? `/plugins/${plugin.plugin_id}`
    : `/plugins/${plugin.plugin_id}/${plugin.instance_id}`

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: instanceKey,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide the original slot while it's being dragged — the DragOverlay takes its place
    opacity: isBeingDragged ? 0 : 1,
  }

  const card = (
    <div ref={setNodeRef} style={style} className="relative">
      {editing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded text-muted hover:text-gray-200 hover:bg-surface-3 transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <WidgetCard plugin={plugin} summary={summary} isMultiInstance={isMultiInstance}>
        <PluginWidget pluginId={plugin.plugin_id} summary={summary} />
      </WidgetCard>
    </div>
  )

  if (editing) return card

  return (
    <Link to={viewPath} className="block hover:opacity-90 transition-opacity">
      {card}
    </Link>
  )
}

// ── Drag overlay — the "ghost" card that follows the cursor ───────────────────

function OverlayCard({
  plugin,
  summary,
}: {
  plugin: PluginListItem
  summary: PluginSummary | undefined
}) {
  return (
    <div className="relative rotate-1 scale-105 shadow-2xl opacity-95 cursor-grabbing">
      <WidgetCard plugin={plugin} summary={summary}>
        <PluginWidget pluginId={plugin.plugin_id} summary={summary} />
      </WidgetCard>
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export function DashboardGrid({
  editing,
  onRegisterHandles,
}: {
  editing: boolean
  onRegisterHandles?: (handles: DashboardGridHandle) => void
}) {
  const { plugins, summaries, fetchSummary, summaryLoading } = usePluginStore()
  const enabled = plugins.filter((p) => p.enabled)

  const instanceCount: Record<string, number> = {}
  for (const p of enabled) {
    instanceCount[p.plugin_id] = (instanceCount[p.plugin_id] ?? 0) + 1
  }

  const [order, setOrder] = useState<string[]>(loadOrder)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Sync order when plugin list changes (new plugins get appended)
  useEffect(() => {
    if (enabled.length > 0) {
      const current = loadOrder()
      const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
      const merged = [
        ...current.filter((id) => enabled.some((p) => keyOf(p) === id)),
        ...enabled.filter((p) => !current.includes(keyOf(p))).map(keyOf),
      ]
      setOrder(merged)
      saveOrder(merged)
      fetchSummary()
    }
  }, [plugins.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort helpers — stable sorts that update both state and localStorage
  function sortAlpha() {
    setOrder((prev) => {
      const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
      const pluginMap = Object.fromEntries(enabled.map((p) => [keyOf(p), p]))
      const next = [...prev].sort((a, b) => {
        const nameA = (pluginMap[a]?.display_name ?? a).toLowerCase()
        const nameB = (pluginMap[b]?.display_name ?? b).toLowerCase()
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
      })
      saveOrder(next)
      return next
    })
  }

  function sortByType() {
    setOrder((prev) => {
      const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
      const pluginMap = Object.fromEntries(enabled.map((p) => [keyOf(p), p]))
      const next = [...prev].sort((a, b) => {
        const pa = pluginMap[a]
        const pb = pluginMap[b]
        const catA = (pa?.category ?? '').toLowerCase()
        const catB = (pb?.category ?? '').toLowerCase()
        if (catA !== catB) return catA < catB ? -1 : 1
        const nameA = (pa?.display_name ?? a).toLowerCase()
        const nameB = (pb?.display_name ?? b).toLowerCase()
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
      })
      saveOrder(next)
      return next
    })
  }

  // Expose sort handles to parent
  useEffect(() => {
    onRegisterHandles?.({ sortAlpha, sortByType })
  }) // intentionally no dep array — always re-register so closures stay fresh

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(String(active.id))
        const newIdx = prev.indexOf(String(over.id))
        const next = arrayMove(prev, oldIdx, newIdx)
        saveOrder(next)
        return next
      })
    }
  }

  if (summaryLoading && summaries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    )
  }

  if (enabled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <p className="text-sm text-muted">No plugins enabled yet.</p>
        <Link to="/settings/plugins" className="btn-primary text-sm px-4 py-2">
          Enable plugins
        </Link>
      </div>
    )
  }

  const summaryMap = Object.fromEntries(
    summaries.map((s) => [`${s.plugin_id}:${s.instance_id ?? 'default'}`, s])
  )
  const sorted = applyOrder(enabled, order)
  const activePlugin = activeId ? sorted.find((p) => `${p.plugin_id}:${p.instance_id}` === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sorted.map((p) => `${p.plugin_id}:${p.instance_id}`)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((plugin) => {
            const key = `${plugin.plugin_id}:${plugin.instance_id}`
            return (
              <SortableWidget
                key={key}
                plugin={plugin}
                summary={summaryMap[key]}
                editing={editing}
                isBeingDragged={activeId === key}
                isMultiInstance={instanceCount[plugin.plugin_id] > 1}
              />
            )
          })}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activePlugin && (
          <OverlayCard
            plugin={activePlugin}
            summary={summaryMap[`${activePlugin.plugin_id}:${activePlugin.instance_id}`]}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
