import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.add('light')
  } else {
    html.classList.remove('light')
  }
}

const stored = (localStorage.getItem('theme') as Theme | null) ?? 'dark'
applyTheme(stored)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: stored,

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      localStorage.setItem('theme', next)
      return { theme: next }
    }),

  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
    set({ theme })
  },
}))
