import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)
const reactRoot = path.dirname(require.resolve('react/package.json'))
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'))
const zustandRoot = path.dirname(require.resolve('zustand/package.json'))
const useSyncExternalStoreWithSelectorShim = path.resolve(
  __dirname,
  'src/shims/useSyncExternalStoreWithSelector.js',
)

export default defineConfig({
  envDir: repoRoot,
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    federation({
      name: 'admin_subscriptions',
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
    dedupe: ['react', 'react-dom'],
    alias: {
      react: reactRoot,
      'react-dom': reactDomRoot,
      'zustand/traditional': path.join(zustandRoot, 'esm/traditional.mjs'),
      'zustand/shallow': path.join(zustandRoot, 'esm/shallow.mjs'),
      'zustand/vanilla': path.join(zustandRoot, 'esm/vanilla.mjs'),
      'use-sync-external-store/shim/with-selector': useSyncExternalStoreWithSelectorShim,
      'use-sync-external-store/shim/with-selector.js': useSyncExternalStoreWithSelectorShim,
      '@': path.resolve(__dirname, 'src'),
      '@nidus-admin/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@nidus-admin/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@xyflow/react'],
  },
  build: { target: 'esnext', minify: false, cssCodeSplit: false, modulePreload: false },
  server: { port: 5181, strictPort: true, cors: true, host: '127.0.0.1' },
  preview: { port: 5181, strictPort: true, cors: true, host: '127.0.0.1' },
})
