import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
})

// Vitest uses vitest.config.ts — see that file for test configuration.
