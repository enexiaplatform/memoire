/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /**
         * The neutral scale, with its two lightest text greys darkened to pass
         * WCAG AA.
         *
         * Tailwind's `gray-400` is #9CA3AF, which is 2.54:1 on white against the
         * 4.5:1 a body-size text needs. It is used in 330 places here, and one
         * of them is the style for a completed plan item - so most of a finished
         * week rendered at 12px in a grey nobody can read, and the Plan board
         * alone failed 29 contrast checks.
         *
         * Retinting the token rather than editing 330 call sites is deliberate:
         * every one of them means "the quiet grey", and the bug is what that
         * grey resolves to.
         *
         * #6C747F was chosen against white (4.73) and the page background
         * (4.52), and those were the only two surfaces checked. The product also
         * puts this grey on tinted chips - blue-50, red-50, amber-50 - which are
         * a shade darker than the page, and on those it landed at 4.32-4.34.
         * Measured against production on 2026-08-13: "Dismiss" on Today, the
         * dates on Plan and the "Opportunity" label on Orders were all failing
         * by that margin, and stock `gray-500` (#6B7280) failed the same way at
         * 4.42.
         *
         * #646B75 is the same cool hue one step darker, and it clears 4.5:1 on
         * every surface this product paints: white 5.38, page 5.14, blue-50
         * 4.95, red-50 4.92, amber-50 5.19, emerald-50 5.11. Both tokens now
         * resolve to it, so "the quiet grey" is one colour rather than two that
         * fail differently.
         *
         * `gray-300` is deliberately left alone: it is mostly `border-gray-300`
         * on inputs, and WCAG's text rule does not apply to a hairline.
         */
        gray: {
          400: '#646B75',
          500: '#646B75',
        },
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
