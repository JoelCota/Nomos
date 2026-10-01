/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,jsx}', './src/modules/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Channel format so opacity modifiers like `bg-accent/10` work.
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        fg: 'var(--fg)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        line: 'var(--line)',
        group: 'var(--group-bg)',
        sidebar: 'var(--sidebar-bg)',
        control: 'var(--control-bg)',
        break: 'var(--break)'
      }
    }
  },
  plugins: []
}
