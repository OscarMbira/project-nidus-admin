import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  envDir: repoRoot,
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    federation({
      name: 'admin_template',
      filename: 'remoteEntry.js',
      exposes: { './routes': './src/index.jsx' },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1' },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
        'react-router-dom': { singleton: true, requiredVersion: '^6.30.2' },
        '@supabase/supabase-js': { singleton: true },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@nidus-admin/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@nidus-admin/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: { target: 'esnext', minify: false, cssCodeSplit: false, modulePreload: false },
  server: { port: 5199, strictPort: true, cors: true, host: '127.0.0.1' },
  preview: { port: 5199, strictPort: true, cors: true, host: '127.0.0.1' },
})
