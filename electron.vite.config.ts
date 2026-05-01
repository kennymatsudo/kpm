import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import type { Plugin } from 'vite'

const isProduction = process.env.NODE_ENV === 'production'
const shouldAnalyze = process.env.ANALYZE === 'true'

// Inject the package.json version at build time so the renderer can show it
// without a round-trip through IPC. Read synchronously here — config evaluates once.
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }
const pkgVersion = packageJson.version

// Load visualizer plugin conditionally for bundle analysis (top-level await, ESM)
let visualizerPlugin: Plugin | null = null
if (shouldAnalyze) {
  try {
    const { visualizer } = await import('rollup-plugin-visualizer')
    visualizerPlugin = visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }) as Plugin
  } catch {
    console.warn('rollup-plugin-visualizer not installed - run: npm install -D rollup-plugin-visualizer')
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      minify: isProduction ? 'esbuild' : false,
      // electron-vite externalizeDeps is enabled by default
      // @openai/codex-sdk is ESM-only (no CJS exports) so it must be bundled
      // rather than externalized, otherwise require() fails at runtime
      externalizeDeps: { exclude: ['@openai/codex-sdk'] },
      // Compile to V8 bytecode in production for source protection
      bytecode: isProduction,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      minify: isProduction ? 'esbuild' : false,
      // electron-vite externalizeDeps is enabled by default
      // Note: bytecode for preload requires sandbox: false
      // which we don't want for security, so skip it
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/preload.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion)
    },
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      minify: isProduction ? 'esbuild' : false,
      // Enable CSS code splitting for better caching
      cssCodeSplit: true,
      // The main renderer entry is intentionally large because the app treats
      // planning, development, and workspace as equally hot paths.
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        // Rolldown accepts boolean/object treeshaking config, not Rollup presets.
        treeshake: true,
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          // Rolldown expects manualChunks as a function instead of an object map.
          manualChunks(id) {
            if (/node_modules[\\/](react|react-dom)[\\/]/.test(id)) {
              return 'react-vendor'
            }
            if (/node_modules[\\/](framer-motion|zustand)[\\/]/.test(id)) {
              return 'ui-vendor'
            }
            return undefined
          }
        }
      }
    },
    plugins: [
      tailwindcss(),
      react(),
      // Bundle analyzer (conditionally loaded via ANALYZE=true)
      ...(visualizerPlugin ? [visualizerPlugin] : [])
    ].filter(Boolean),
    resolve: {
      // plugin-react no longer auto-deduplicates React; set explicitly
      // to prevent duplicate React instances when multiple copies resolve
      dedupe: ['react', 'react-dom'],
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
