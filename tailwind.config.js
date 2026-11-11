/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#fcfbf9',
        ink: '#171717',
        accent: '#4338ca',
        line: '#e5e5e5',
        clay: '#7b1e3f',
        // extended palette: green is the ambient delta hue, red is the sun accent
        green: {
          50: '#effaf4',
          200: '#bfe8d0',
          400: '#6fcf9b',
          900: '#0f3d2e',
        },
        red: {
          300: '#f4a3a8',
          500: '#e5484d',
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
        'cta-pulse': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(67,56,202,0)' },
          '50%': { transform: 'scale(1.02)', boxShadow: '0 12px 40px 20px rgba(67,56,202,0.16)' },
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
