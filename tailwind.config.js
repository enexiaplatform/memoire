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
        spectrum: {
          green: '#43A047',
          cyan: '#00ACC1',
          blue: '#1976D2',
          indigo: '#3949AB',
          purple: '#7B1FA2',
          magenta: '#C2185B',
          orange: '#FF5722',
        },
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
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#43A047,#00ACC1,#1976D2,#3949AB,#7B1FA2,#C2185B,#FF5722)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
