/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d1117',
        surface: 'rgba(22, 27, 34, 0.85)',
        accent: '#58a6ff',
        muted: '#8b949e',
        success: '#3fb950',
      },
    },
  },
  plugins: [],
}
