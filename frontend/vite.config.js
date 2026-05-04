import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Use minified p5 build to avoid Friendly Error System (FES)
      // which throws false "red()" errors in production
      'p5': path.resolve(__dirname, 'node_modules/p5/lib/p5.esm.min.js'),
    },
  },
})
