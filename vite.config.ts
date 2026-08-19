import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Document-relative by default, so the same `dist/` works unchanged at `/`
 * (user site or custom domain) and at `/<repo>/` (project site) without the
 * repository name having to be known at build time. VITE_BASE can still pin an
 * absolute base if a deployment ever needs one.
 */
const base = process.env.VITE_BASE ?? './'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
