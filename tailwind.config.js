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
        /*
         * Daylight - the 2026-09-14 visual system (Claude Design, "Memoire App
         * v3"). Additive on purpose: every token above keeps its value, so a
         * page that has not been redrawn yet looks exactly as it did.
         *
         * Two departures from the mock, both for contrast. The mock's micro
         * labels are #8A94A1, which is 3.07:1 on white; they take `muted`, the
         * same quiet grey `gray-400/500` resolve to above. And an amber pill is
         * #B45309 on #FDF1DC in the mock, 4.49:1 - one hundredth short - so the
         * pill ground is a shade lighter. Every pair below was measured.
         */
        ink: '#0B141C',
        rail: {
          DEFAULT: '#08111A',
          line: '#243447',
        },
        canvas: '#F4F7FA',
        bar: '#FBFCFE',
        line: {
          DEFAULT: '#E7ECF2',
          soft: '#F1F4F8',
          strong: '#E0E6ED',
        },
        chip: '#EEF2F7',
        track: '#F0F3F7',
        muted: '#646B75',
        tint: {
          red: { bg: '#FDECEC', ink: '#7F1D1D', solid: '#B91C1C' },
          amber: { bg: '#FFF8E6', ink: '#78350F', solid: '#B45309', pill: '#FFF3DA' },
          green: { bg: '#EEFAF3', ink: '#065F46', solid: '#047857', pill: '#E3F4EA' },
          cyan: { bg: '#D5F3F8', ink: '#0E7490' },
          violet: { bg: '#EDE7F6', ink: '#7B1FA2' },
          blue: { bg: '#E1EEFB', ink: '#1565C0' },
          neutral: { bg: '#F4F7FA', ink: '#4B5563' },
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
        // Daylight: a metric tile and a day column, and the panels around them.
        tile:  '18px',
        panel: '20px',
      },
      boxShadow: {
        card:     '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
        elevated: '0 4px 16px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06)',
        // Daylight. A tight contact shadow plus a long soft fall, so a white
        // surface lifts off the canvas without a border drawn around it.
        panel:     '0 1px 3px rgba(11,20,28,0.06), 0 14px 32px -24px rgba(11,20,28,0.55)',
        lift:      '0 1px 3px rgba(11,20,28,0.06), 0 12px 28px -20px rgba(11,20,28,0.5)',
        'lift-hi': '0 1px 3px rgba(11,20,28,0.06), 0 22px 36px -22px rgba(11,20,28,0.55)',
        'btn-blue': '0 8px 18px -8px rgba(25,118,210,0.8)',
        today:     '0 1px 3px rgba(11,20,28,0.06), 0 22px 40px -26px rgba(25,118,210,0.45)',
        seg:       '0 1px 2px rgba(11,20,28,0.1)',
      },
      /*
       * Entry and data motion. Every one is `both`, so a staggered element is
       * invisible until its turn rather than flashing in and then animating -
       * which is also why the reduced-motion rule in index.css zeroes delays as
       * well as durations.
       */
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'grow-h': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'none' },
        },
        'grow-v': {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'none' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
        caret: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.4,0,.2,1) both',
        'grow-h': 'grow-h .6s cubic-bezier(.4,0,.2,1) both',
        'grow-v': 'grow-v .6s cubic-bezier(.4,0,.2,1) both',
        'pulse-dot': 'pulse-dot 2.8s ease-in-out infinite',
        caret: 'caret 1.1s step-end infinite',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#43A047,#00ACC1,#1976D2,#3949AB,#7B1FA2,#C2185B,#FF5722)',
        // The five cool stops only. The warm tail of the wordmark gradient
        // reads as a warning colour when it runs along the edge of a card.
        'daylight-edge': 'linear-gradient(135deg,#43A047,#00ACC1,#1976D2,#3949AB,#7B1FA2)',
        'rail-card': 'linear-gradient(155deg,#15263A 0%,#1E3A52 100%)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
