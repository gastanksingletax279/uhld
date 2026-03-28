import { create } from 'zustand'
import { api, PluginDetail, PluginListItem, PluginSummary } from '../api/client'

interface PluginState {
  plugins: PluginListItem[]
  summaries: PluginSummary[]
  loading: boolean
  summaryLoading: boolean

  fetchPlugins: () => Promise<void>
  fetchSummary: () => Promise<void>
  enablePlugin: (id: string, config: Record<string, unknown>) => Promise<void>
  disablePlugin: (id: string) => Promise<void>
  updateConfig: (id: string, config: Record<string, unknown>) => Promise<void>
  clearPlugin: (id: string) => Promise<void>
  getPluginDetail: (id: string) => Promise<PluginDetail>
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

  enablePlugin: async (id, config) => {
    await api.enablePlugin(id, config)
    // Refresh plugin list after enabling
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  disablePlugin: async (id) => {
    await api.disablePlugin(id)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  updateConfig: async (id, config) => {
    await api.updatePluginConfig(id, config)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  clearPlugin: async (id) => {
    await api.clearPlugin(id)
    const plugins = await api.listPlugins()
    set({ plugins })
  },

  getPluginDetail: (id) => api.getPlugin(id),
}))
