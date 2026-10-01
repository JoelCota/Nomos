/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [__dirname + '/index.html', __dirname + '/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        bg: 'var(--bg)',
        card: 'var(--card)',
        fg: 'var(--fg)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        line: 'var(--line)',
        fill: 'var(--fill)',
        good: 'var(--good)',
        bad: 'var(--bad)'
      }
    }
  },
  plugins: []
}
