import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const isProduction = process.env.NODE_ENV === 'production'
const shouldAnalyze = process.env.ANALYZE === 'true'

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
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      minify: isProduction ? 'esbuild' : false,
      // Enable CSS code splitting for better caching
      cssCodeSplit: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
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
      // to prevent duplicate React instances when multiple copies resolve
      dedupe: ['react', 'react-dom'],
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
