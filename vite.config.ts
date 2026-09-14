import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const single = mode === 'single' || process.env.SINGLE === '1'

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
    server: {
      strictPort: false,
    },
    build: {
      target: 'es2022',
      cssCodeSplit: !single,
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
  }
})
