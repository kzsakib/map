/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#fcfbf9',
        ink: '#171717',
        line: '#e5e5e5',
        muted: '#6b6b6b',
        // green leads: 700 is the action colour, white text on it passes AA
        accent: '#1f7a54',
        green: {
          50: '#effaf4',
          200: '#bfe8d0',
          400: '#6fcf9b',
          700: '#1f7a54',
          900: '#0f3d2e',
        },
        rose: {
          50: '#fff1f1',
          300: '#f4a3a8',
          500: '#e5484d',
        },
        maroon: {
          900: '#2a0716',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      borderRadius: {
        card: '1rem',
        footer: '5rem',
      },
      keyframes: {
        'mesh-drift': {
          '0%': { transform: 'translate3d(-4%, -2%, 0) scale(1)' },
          '50%': { transform: 'translate3d(4%, 3%, 0) scale(1.08)' },
          '100%': { transform: 'translate3d(-4%, -2%, 0) scale(1)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(40px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'card-in': {
          from: { opacity: '0', transform: 'translateY(40px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'cta-pulse': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(111,207,155,0)' },
          '50%': { transform: 'scale(1.02)', boxShadow: '0 12px 40px 20px rgba(111,207,155,0.22)' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
      },
      animation: {
        'mesh-drift': 'mesh-drift 30s linear infinite',
        'cta-pulse': 'cta-pulse 3s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'dot-pulse': 'dot-pulse 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [],
}
