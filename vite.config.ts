import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // GitHub Pages project site: https://kzsakib.github.io/map/
  // In dev we serve from / so the local preview works at the server root;
  // every fetch goes through import.meta.env.BASE_URL, so both agree.
  base: mode === 'production' ? '/map/' : '/',
  plugins: [react()],
  server: {
    // the python venv and raw downloads hold tens of thousands of files; letting
    // the watcher touch them hits the inotify limit and kills the dev server
    watch: {
      ignored: ['**/.venv/**', '**/scripts/raw/**', '**/dist/**', '**/node_modules/**'],
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', 'three-stdlib'],
          motion: ['gsap', 'lenis'],
        },
      },
    },
  },
}))
