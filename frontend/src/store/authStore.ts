import { create } from 'zustand'
import { api, User } from '../api/client'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  login: (username: string, password: string) => Promise<{ requires_totp?: boolean; partial_token?: string }>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  clearSetupFlag: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (username, password) => {
    set({ loading: true })
    try {
      const res = await api.login(username, password)
      if ('requires_totp' in res && res.requires_totp) {
        set({ loading: false })
        return { requires_totp: true, partial_token: res.partial_token }
      }
      set({ user: (res as { user: User }).user, loading: false })
      return {}
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  logout: async () => {
    await api.logout()
    set({ user: null })
  },

  fetchMe: async () => {
    try {
      const user = await api.me()
      set({ user, initialized: true })
    } catch {
      set({ user: null, initialized: true })
    }
  },

  clearSetupFlag: () => {
    set((state) => state.user ? { user: { ...state.user, needs_setup: false } } : {})
  },

  setUser: (user: User) => set({ user }),
}))
