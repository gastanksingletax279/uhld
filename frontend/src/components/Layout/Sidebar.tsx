import { useEffect, useState, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePluginStore } from '../../store/pluginStore'
import { api } from '../../api/client'
import { Server, LayoutDashboard, Settings, Puzzle, GripVertical, Pencil, Check, ChevronDown, ChevronRight, Plus, Trash2, ArrowUpDown, FolderOpen, Folder } from 'lucide-react'
import { PluginIcon } from '../PluginIcon'
import type { PluginListItem } from '../../api/client'

// ── Persist sidebar menu structure in localStorage ────────────────────────────

const MENU_STRUCTURE_KEY = 'menu_structure'

interface MenuSection {
  id: string
  label: string
  expanded: boolean
  items: string[] // plugin keys (plugin_id:instance_id)
}

interface MenuStructure {
  sections: MenuSection[]
  unsectioned: string[] // plugin keys not in any section
}

const CATEGORY_ORDER = [
  'virtualization', 'containers', 'monitoring', 'network', 'storage', 'infrastructure', 'media', 'arr', 'security', 'automation', 'other',
]

function loadMenuStructure(): MenuStructure {
  try {
    return JSON.parse(localStorage.getItem(MENU_STRUCTURE_KEY) ?? 'null') ?? { sections: [], unsectioned: [] }
  } catch {
    return { sections: [], unsectioned: [] }
  }
}

function saveMenuStructure(structure: MenuStructure) {
  localStorage.setItem(MENU_STRUCTURE_KEY, JSON.stringify(structure))
  // Sync to backend for cross-device persistence
  api.updateMenuStructure(JSON.stringify(structure)).catch(() => {
    // Silent fail —localStorage still works if backend is unavailable
  })
}

function initMenuStructure(plugins: PluginListItem[]): MenuStructure {
  const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
  const existingStructure = loadMenuStructure()
  
  // Collect all plugin keys
  const allKeys = plugins.map(keyOf)
  
  // Clean up sections: remove invalid items
  const cleanedSections = existingStructure.sections.map(section => ({
    ...section,
    items: section.items.filter(key => allKeys.includes(key))
  }))
  
  // Find which keys are already placed
  const placedKeys = new Set<string>()
  cleanedSections.forEach(section => section.items.forEach(key => placedKeys.add(key)))
  existingStructure.unsectioned.forEach(key => {
    if (allKeys.includes(key)) placedKeys.add(key)
  })
  
  // Add new plugins to unsectioned
  const newKeys = allKeys.filter(key => !placedKeys.has(key))
  const cleanedUnsectioned = existingStructure.unsectioned.filter(key => allKeys.includes(key))
  
  // Sort new keys by category order (default behavior for new plugins)
  const pluginMap = Object.fromEntries(plugins.map(p => [keyOf(p), p]))
  const sortedNewKeys = newKeys.sort((a, b) => {
    const pa = pluginMap[a]
    const pb = pluginMap[b]
    if (!pa || !pb) return 0
    const ai = CATEGORY_ORDER.indexOf(pa.category || 'other')
    const bi = CATEGORY_ORDER.indexOf(pb.category || 'other')
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  
  return {
    sections: cleanedSections,
    unsectioned: [...cleanedUnsectioned, ...sortedNewKeys]
  }
}

// ── Sortable plugin nav item ───────────────────────────────────────────────────

function SortableNavItem({
  plugin,
  instanceCount,
  editing,
  isDraggingAny,
}: {
  plugin: PluginListItem
  instanceCount: number
  editing: boolean
  isDraggingAny: boolean
}) {
  const instanceKey = `${plugin.plugin_id}:${plugin.instance_id}`
  const viewPath =
    plugin.instance_id === 'default'
      ? `/plugins/${plugin.plugin_id}`
      : `/plugins/${plugin.plugin_id}/${plugin.instance_id}`

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item-${instanceKey}`,
    data: { type: 'item', key: instanceKey, plugin }
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

// ── Sortable section ───────────────────────────────────────────────────────────

function SortableSection({
  section,
  plugins,
  instanceCount,
  editing,
  isDraggingAny,
  onToggle,
  onRename,
  onDelete,
}: {
  section: MenuSection
  plugins: Map<string, PluginListItem>
  instanceCount: Record<string, number>
  editing: boolean
  isDraggingAny: boolean
  onToggle: () => void
  onRename: (newLabel: string) => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(section.label)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section-${section.id}`,
    data: { type: 'section', id: section.id }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const sectionPlugins = section.items
    .map(key => plugins.get(key))
    .filter((p): p is PluginListItem => p !== undefined)

  const handleRenameSubmit = () => {
    if (renameValue.trim()) {
      onRename(renameValue.trim())
    }
    setRenaming(false)
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Section header */}
      <div className="flex items-center gap-1 px-1 py-1 group">
        {/* Drag handle */}
        {editing && (
          <div
            {...attributes}
            {...listeners}
            className="p-0.5 rounded flex-shrink-0 cursor-grab active:cursor-grabbing text-muted/60 hover:text-muted transition-colors"
            title="Drag to reorder section"
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}

        {/* Expand/collapse button */}
        <button
          onClick={onToggle}
          className="p-0.5 rounded flex-shrink-0 text-muted/60 hover:text-muted hover:bg-surface-3 transition-colors"
          title={section.expanded ? 'Collapse' : 'Expand'}
        >
          {section.expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Section icon and label */}
        {renaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') {
                setRenameValue(section.label)
                setRenaming(false)
              }
            }}
            className="flex-1 px-2 py-0.5 text-xs bg-surface-3 border border-surface-4 rounded text-white"
            autoFocus
          />
        ) : (
          <>
            <span className="flex-shrink-0 text-muted/60">
              {section.expanded ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
            </span>
            <button
              onClick={editing ? () => setRenaming(true) : onToggle}
              className="flex-1 text-left text-xs font-medium text-muted/80 hover:text-muted truncate"
              title={editing ? 'Click to rename' : section.label}
            >
              {section.label}
            </button>
          </>
        )}

        {/* Delete button (editing mode only) */}
        {editing && !renaming && (
          <button
            onClick={onDelete}
            className="p-0.5 rounded flex-shrink-0 text-muted/40 hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete section"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        {/* Item count */}
        {!renaming && (
          <span className="text-xs text-muted/40 flex-shrink-0">
            {sectionPlugins.length}
          </span>
        )}
      </div>

      {/* Section items */}
      {section.expanded && sectionPlugins.length > 0 && (
        <div className="ml-4 space-y-0.5">
          {sectionPlugins.map(plugin => (
            <SortableNavItem
              key={`${plugin.plugin_id}:${plugin.instance_id}`}
              plugin={plugin}
              instanceCount={instanceCount[plugin.plugin_id] ?? 1}
              editing={editing}
              isDraggingAny={isDraggingAny}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { plugins, fetchPlugins } = usePluginStore()
  const [version, setVersion] = useState<string | null>(null)
  const [backendMenuLoaded, setBackendMenuLoaded] = useState(false)

  useEffect(() => {
    fetchPlugins()
    // Fetch version on mount
    api.version().then(data => setVersion(data.version)).catch(() => {})
    
    // Load menu structure from backend on mount
    api.getMenuStructure().then(data => {
      if (data.menu_structure) {
        try {
          const backendStructure = JSON.parse(data.menu_structure)
          // Merge backend structure with current (localStorage)
          setMenuStructure(backendStructure)
          // Also update localStorage to sync
          localStorage.setItem(MENU_STRUCTURE_KEY, data.menu_structure)
        } catch {
          // Invalid JSON in backend, ignore
        }
      }
      setBackendMenuLoaded(true)
    }).catch(() => {
      setBackendMenuLoaded(true)  // Continue even if backend load fails
    })
  }, [fetchPlugins])

  const enabled = plugins.filter((p) => p.enabled)

  const instanceCount: Record<string, number> = {}
  for (const p of enabled) {
    instanceCount[p.plugin_id] = (instanceCount[p.plugin_id] ?? 0) + 1
  }

  const [menuStructure, setMenuStructure] = useState<MenuStructure>(() => loadMenuStructure())
  const [isMenuInitialized, setIsMenuInitialized] = useState(false)
  const [editing, setEditing] = useState(false)
  const [creatingSection, setCreatingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [draggingItem, setDraggingItem] = useState<{ type: string; key?: string; id?: string } | null>(null)
  
  // Track the previous plugin keys to detect additions/removals
  const prevPluginKeysRef = useRef<string>('')

  // Create stable key from enabled plugin list to detect actual changes (not just reference changes)
  const enabledPluginsKey = enabled
    .map(p => `${p.plugin_id}:${p.instance_id}`)
    .sort()
    .join(',')

  // Sync menu structure with plugins: initialize on first load, then only update on add/remove
  useEffect(() => {
    // Skip if no plugins loaded yet
    if (enabled.length === 0) {
      prevPluginKeysRef.current = ''
      return
    }
    
    // If this is the first load, only add new plugins without reordering existing ones
    if (!isMenuInitialized) {
      setMenuStructure(prev => {
        const keyOf = (p: PluginListItem) => `${p.plugin_id}:${p.instance_id}`
        const allKeys = enabled.map(keyOf)
        
        // Clean up sections: remove plugins that no longer exist
        const cleanedSections = prev.sections.map(section => ({
          ...section,
          items: section.items.filter(key => allKeys.includes(key))
        }))
        
        // Find which keys are already placed
        const placedKeys = new Set<string>()
        cleanedSections.forEach(section => section.items.forEach(key => placedKeys.add(key)))
        prev.unsectioned.forEach(key => {
          if (allKeys.includes(key)) placedKeys.add(key)
        })
        
        // Find new plugins that aren't in localStorage
        const newKeys = allKeys.filter(key => !placedKeys.has(key))
        
        // Clean unsectioned without reordering
        const cleanedUnsectioned = prev.unsectioned.filter(key => allKeys.includes(key))
        
        // Sort only the new keys by category
        const pluginMap = Object.fromEntries(enabled.map(p => [keyOf(p), p]))
        const sortedNewKeys = newKeys.sort((a, b) => {
          const pa = pluginMap[a]
          const pb = pluginMap[b]
          if (!pa || !pb) return 0
          const ai = CATEGORY_ORDER.indexOf(pa.category || 'other')
          const bi = CATEGORY_ORDER.indexOf(pb.category || 'other')
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
        
        const updated = {
          sections: cleanedSections,
          unsectioned: [...cleanedUnsectioned, ...sortedNewKeys]
        }
        
        saveMenuStructure(updated)
        return updated
      })
      
      setIsMenuInitialized(true)
      prevPluginKeysRef.current = enabledPluginsKey
      return
    }
    
    // Only update if plugins actually changed (addition/removal)
    if (prevPluginKeysRef.current !== enabledPluginsKey) {
      const updated = initMenuStructure(enabled)
      setMenuStructure(updated)
      saveMenuStructure(updated)
      prevPluginKeysRef.current = enabledPluginsKey
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledPluginsKey, enabled, isMenuInitialized])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // Build plugin map for lookups
  const pluginMap = new Map<string, PluginListItem>()
  for (const p of enabled) {
    pluginMap.set(`${p.plugin_id}:${p.instance_id}`, p)
  }

  const unsectionedPlugins = menuStructure.unsectioned
    .map(key => pluginMap.get(key))
    .filter((p): p is PluginListItem => p !== undefined)

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const data = active.data.current as { type: string; key?: string; id?: string } | undefined
    setDraggingItem(data || null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingItem(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeData = active.data.current as { type: string; key?: string; id?: string }
    const overData = over.data.current as { type: string; key?: string; id?: string; sectionId?: string }

    if (!activeData) return

    setMenuStructure(prev => {
      const next = { ...prev, sections: [...prev.sections], unsectioned: [...prev.unsectioned] }

      // Handle section reordering
      if (activeData.type === 'section' && overData?.type === 'section') {
        const oldIdx = next.sections.findIndex(s => s.id === activeData.id)
        const newIdx = next.sections.findIndex(s => s.id === overData.id)
        if (oldIdx !== -1 && newIdx !== -1) {
          next.sections = arrayMove(next.sections, oldIdx, newIdx)
        }
      }

      // Handle item drag
      if (activeData.type === 'item' && activeData.key) {
        const itemKey = activeData.key

        // Remove from current location
        const oldSectionIdx = next.sections.findIndex(s => s.items.includes(itemKey))
        if (oldSectionIdx !== -1) {
          next.sections[oldSectionIdx] = {
            ...next.sections[oldSectionIdx],
            items: next.sections[oldSectionIdx].items.filter(k => k !== itemKey)
          }
        } else {
          next.unsectioned = next.unsectioned.filter(k => k !== itemKey)
        }

        // Add to new location
        if (overData?.type === 'section' && overData.id) {
          // Dropped on section header - add to end of section
          const sectionIdx = next.sections.findIndex(s => s.id === overData.id)
          if (sectionIdx !== -1) {
            next.sections[sectionIdx] = {
              ...next.sections[sectionIdx],
              items: [...next.sections[sectionIdx].items, itemKey],
              expanded: true // Auto-expand when item added
            }
          }
        } else if (overData?.type === 'item' && overData.key) {
          // Dropped on another item - insert before/after
          const targetSectionIdx = next.sections.findIndex(s => s.items.includes(overData.key!))
          if (targetSectionIdx !== -1) {
            const items = [...next.sections[targetSectionIdx].items]
            const targetIdx = items.indexOf(overData.key!)
            items.splice(targetIdx, 0, itemKey)
            next.sections[targetSectionIdx] = {
              ...next.sections[targetSectionIdx],
              items
            }
          } else {
            // Both in unsectioned - reorder
            const targetIdx = next.unsectioned.indexOf(overData.key!)
            if (targetIdx !== -1) {
              next.unsectioned.splice(targetIdx, 0, itemKey)
            } else {
              next.unsectioned.push(itemKey)
            }
          }
        } else {
          // Dropped on empty space - add to unsectioned
          next.unsectioned.push(itemKey)
        }
      }

      saveMenuStructure(next)
      return next
    })
  }

  function toggleSection(sectionId: string) {
    setMenuStructure(prev => {
      const next = {
        ...prev,
        sections: prev.sections.map(s =>
          s.id === sectionId ? { ...s, expanded: !s.expanded } : s
        )
      }
      saveMenuStructure(next)
      return next
    })
  }

  function renameSection(sectionId: string, newLabel: string) {
    setMenuStructure(prev => {
      const next = {
        ...prev,
        sections: prev.sections.map(s =>
          s.id === sectionId ? { ...s, label: newLabel } : s
        )
      }
      saveMenuStructure(next)
      return next
    })
  }

  function deleteSection(sectionId: string) {
    setMenuStructure(prev => {
      const section = prev.sections.find(s => s.id === sectionId)
      if (!section) return prev
      
      const next = {
        sections: prev.sections.filter(s => s.id !== sectionId),
        unsectioned: [...prev.unsectioned, ...section.items]
      }
      saveMenuStructure(next)
      return next
    })
  }

  function createSection() {
    if (!newSectionName.trim()) return
    
    setMenuStructure(prev => {
      const next = {
        ...prev,
        sections: [
          ...prev.sections,
          {
            id: `section-${Date.now()}`,
            label: newSectionName.trim(),
            expanded: true,
            items: []
          }
        ]
      }
      saveMenuStructure(next)
      return next
    })
    
    setNewSectionName('')
    setCreatingSection(false)
  }

  function sortAlphabetically() {
    setMenuStructure(prev => {
      const next = {
        sections: prev.sections.map(section => ({
          ...section,
          items: [...section.items].sort((a, b) => {
            const pa = pluginMap.get(a)
            const pb = pluginMap.get(b)
            if (!pa || !pb) return 0
            const labelA = instanceCount[pa.plugin_id] > 1 
              ? `${pa.display_name} — ${pa.instance_label || pa.instance_id}`
              : pa.display_name
            const labelB = instanceCount[pb.plugin_id] > 1
              ? `${pb.display_name} — ${pb.instance_label || pb.instance_id}`
              : pb.display_name
            return labelA.localeCompare(labelB)
          })
        })),
        unsectioned: [...prev.unsectioned].sort((a, b) => {
          const pa = pluginMap.get(a)
          const pb = pluginMap.get(b)
          if (!pa || !pb) return 0
          const labelA = instanceCount[pa.plugin_id] > 1
            ? `${pa.display_name} — ${pa.instance_label || pa.instance_id}`
            : pa.display_name
          const labelB = instanceCount[pb.plugin_id] > 1
            ? `${pb.display_name} — ${pb.instance_label || pb.instance_id}`
            : pb.display_name
          return labelA.localeCompare(labelB)
        })
      }
      
      // Also sort sections alphabetically
      next.sections.sort((a, b) => a.label.localeCompare(b.label))
      
      saveMenuStructure(next)
      return next
    })
  }

  // Create sortable IDs for all items
  const allSortableIds = [
    ...menuStructure.sections.map(s => `section-${s.id}`),
    ...menuStructure.sections.flatMap(s => s.items.map(k => `item-${k}`)),
    ...menuStructure.unsectioned.map(k => `item-${k}`)
  ]

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
        {/* Dashboard + edit toggle */}
        <div className="flex items-center mx-1 mb-2">
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
          {(menuStructure.sections.length > 0 || menuStructure.unsectioned.length > 0) && (
            <button
              onClick={() => setEditing((v) => !v)}
              className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                editing
                  ? 'text-accent bg-accent-dim/20 hover:bg-accent-dim/30'
                  : 'text-muted/40 hover:text-muted hover:bg-surface-3'
              }`}
              title={editing ? 'Done editing' : 'Edit menu'}
            >
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Edit mode toolbar */}
        {editing && (
          <div className="mx-1 mb-2 flex gap-1">
            <button
              onClick={sortAlphabetically}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 bg-surface-3 hover:bg-surface-4 border border-surface-4 rounded text-xs text-muted transition-colors"
              title="Sort all items alphabetically"
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort A-Z</span>
            </button>
            <button
              onClick={() => setCreatingSection(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 bg-surface-3 hover:bg-surface-4 border border-surface-4 rounded text-xs text-muted transition-colors"
              title="Add new section"
            >
              <Plus className="w-3 h-3" />
              <span>Section</span>
            </button>
          </div>
        )}

        {/* Create section form */}
        {creatingSection && (
          <div className="mx-1 mb-2 p-2 bg-surface-2 border border-surface-4 rounded">
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSection()
                if (e.key === 'Escape') {
                  setCreatingSection(false)
                  setNewSectionName('')
                }
              }}
              placeholder="Section name..."
              className="w-full px-2 py-1 text-xs bg-surface-3 border border-surface-4 rounded text-white mb-1"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={createSection}
                className="flex-1 px-2 py-1 bg-accent-dim hover:bg-accent-dim/80 text-white text-xs rounded transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreatingSection(false)
                  setNewSectionName('')
                }}
                className="flex-1 px-2 py-1 bg-surface-3 hover:bg-surface-4 text-muted text-xs rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Menu items */}
        {(menuStructure.sections.length > 0 || menuStructure.unsectioned.length > 0) && (
          <div className="mt-1">
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={allSortableIds}
                strategy={verticalListSortingStrategy}
              >
                {/* Sections */}
                {menuStructure.sections.map(section => (
                  <SortableSection
                    key={section.id}
                    section={section}
                    plugins={pluginMap}
                    instanceCount={instanceCount}
                    editing={editing}
                    isDraggingAny={draggingItem !== null}
                    onToggle={() => toggleSection(section.id)}
                    onRename={(newLabel) => renameSection(section.id, newLabel)}
                    onDelete={() => deleteSection(section.id)}
                  />
                ))}

                {/* Unsectioned items */}
                {unsectionedPlugins.length > 0 && (
                  <div className="space-y-0.5">
                    {unsectionedPlugins.map(plugin => (
                      <SortableNavItem
                        key={`${plugin.plugin_id}:${plugin.instance_id}`}
                        plugin={plugin}
                        instanceCount={instanceCount[plugin.plugin_id] ?? 1}
                        editing={editing}
                        isDraggingAny={draggingItem !== null}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>

              {/* Drag overlay */}
              <DragOverlay>
                {draggingItem?.type === 'item' && draggingItem.key && pluginMap.get(draggingItem.key) && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-surface-4 rounded shadow-xl text-sm text-white">
                    <PluginIcon name={pluginMap.get(draggingItem.key)!.icon} className="w-4 h-4" />
                    <span>
                      {instanceCount[pluginMap.get(draggingItem.key)!.plugin_id] > 1
                        ? `${pluginMap.get(draggingItem.key)!.display_name} — ${pluginMap.get(draggingItem.key)!.instance_label || pluginMap.get(draggingItem.key)!.instance_id}`
                        : pluginMap.get(draggingItem.key)!.display_name}
                    </span>
                  </div>
                )}
                {draggingItem?.type === 'section' && draggingItem.id && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-surface-4 rounded shadow-xl text-xs font-medium text-muted">
                    <Folder className="w-3.5 h-3.5" />
                    <span>{menuStructure.sections.find(s => s.id === draggingItem.id)?.label}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        )}

        {/* Bottom links */}
        <div className="mt-3 border-t border-surface-4 pt-2">
          <SidebarLink to="/settings/plugins" icon={<Puzzle className="w-4 h-4" />} label="Plugins" />
          <SidebarLink to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>

        {/* Version footer */}
        {version && (
          <div className="mt-2 px-3 py-2 text-xs text-muted/60 border-t border-surface-4">
            <div className="flex items-center justify-between">
              <span>Version</span>
              <span className="font-mono">{version}</span>
            </div>
          </div>
        )}
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
