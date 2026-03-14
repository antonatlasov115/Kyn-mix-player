/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{svelte,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'accent-primary': 'var(--accent-primary)',
        'accent-secondary': 'var(--accent-secondary)',
        'accent-glow': 'var(--accent-glow)',
        'text-main': 'var(--text-main)',
        'text-dim': 'var(--text-dim)',
        'bg-navy': 'var(--bg-navy)',
        'bg-deep': 'var(--bg-deep)'
      }
    }
  },
  plugins: []
}
