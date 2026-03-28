import { create } from 'zustand'
import { api, User } from '../api/client'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (username, password) => {
    set({ loading: true })
    try {
      const res = await api.login(username, password)
      set({ user: res.user, loading: false })
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
}))
