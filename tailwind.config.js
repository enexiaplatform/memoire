/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy memoire scale kept for Landing/History pages (Prompts 08/09 already use indigo)
        memoire: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },
        // Enexia Design System tokens
        navy: {
          DEFAULT: '#1B2B3A',
          light:   '#243447',
          dark:    '#0F1C28',
        },
        'brand-blue':      '#1976D2',
        'brand-blue-dark': '#1565C0',
        page:              '#F8FAFC',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        pill:  '999px',
        card:  '12px',
        modal: '16px',
      },
      boxShadow: {
        card:     '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
        elevated: '0 4px 16px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
