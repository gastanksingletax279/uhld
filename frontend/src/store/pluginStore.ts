import { create } from 'zustand'
import { api, PluginDetail, PluginListItem, PluginSummary } from '../api/client'

interface PluginState {
  plugins: PluginListItem[]
  summaries: PluginSummary[]
  loading: boolean
  summaryLoading: boolean

  fetchPlugins: () => Promise<void>
  fetchSummary: () => Promise<void>
  enablePlugin: (id: string, config: Record<string, unknown>, instanceId?: string, instanceLabel?: string) => Promise<void>
  disablePlugin: (id: string, instanceId?: string) => Promise<void>
  updateConfig: (id: string, config: Record<string, unknown>, instanceId?: string, instanceLabel?: string) => Promise<void>
  clearPlugin: (id: string, instanceId?: string) => Promise<void>
  getPluginDetail: (id: string, instanceId?: string) => Promise<PluginDetail>
  deleteInstance: (id: string, instanceId: string) => Promise<void>
  createInstance: (id: string, instanceId: string, instanceLabel: string, config: Record<string, unknown>) => Promise<void>
}

export const usePluginStore = create<PluginState>((set) => ({
  plugins: [],
  summaries: [],
  loading: false,
  summaryLoading: false,

  fetchPlugins: async () => {
    set({ loading: true })
    try {
      const plugins = await api.listPlugins()
      set({ plugins, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchSummary: async () => {
    set({ summaryLoading: true })
    try {
      const res = await api.dashboardSummary()
      set({ summaries: res.plugins, summaryLoading: false })
    } catch {
      set({ summaryLoading: false })
    }
  },

  enablePlugin: async (id, config, instanceId = 'default', instanceLabel) => {
    await api.enablePlugin(id, config, instanceId, instanceLabel)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  disablePlugin: async (id, instanceId = 'default') => {
    await api.disablePlugin(id, instanceId)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  updateConfig: async (id, config, instanceId = 'default', instanceLabel) => {
    await api.updatePluginConfig(id, config, instanceId, instanceLabel)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  clearPlugin: async (id, instanceId = 'default') => {
    await api.clearPlugin(id, instanceId)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  getPluginDetail: (id, instanceId = 'default') => api.getPlugin(id, instanceId),

  deleteInstance: async (id, instanceId) => {
    await api.deleteInstance(id, instanceId)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  createInstance: async (id, instanceId, instanceLabel, config) => {
    await api.createInstance(id, instanceId, instanceLabel, config)
    const plugins = await api.listPlugins()
    set({ plugins })
  },
}))
