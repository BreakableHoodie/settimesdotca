/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'band-navy': '#1a1a2e',
        'band-purple': '#16213e',
        'band-orange': '#ff6b35'
      },
      fontFamily: {
        // System fonts only (no web fonts)
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
}
