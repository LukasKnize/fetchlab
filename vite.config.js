import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Electron loads the built app via file://, so asset paths must be relative.
  // In dev (serve) the default '/' base is fine since we load from localhost.
  base: command === 'build' ? './' : '/',
  build: {
    outDir: 'dist',
  },
}))
