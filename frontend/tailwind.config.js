/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark industrial palette
        surface: {
          DEFAULT: '#0f1117',
          1: '#161b22',
          2: '#1c2128',
          3: '#21262d',
          4: '#30363d',
        },
        accent: {
          DEFAULT: '#58a6ff',
          dim: '#1f6feb',
        },
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149',
        muted: '#8b949e',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
