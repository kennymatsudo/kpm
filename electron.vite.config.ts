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

// The pi catalog sidecar must reach dist/main untransformed: it is plain ESM
// run by a child Electron process under ELECTRON_RUN_AS_NODE, so it must not
// be bundled into the CJS main chunk or compiled to bytecode. Emitting it as
// an asset keeps it out of both passes while placing it next to the bundle
// that resolves it via __dirname.
function copyPiCatalogProcess(): Plugin {
  const source = resolve(__dirname, 'src/main/pi/piCatalogProcess.mjs')
  return {
    name: 'kpm-copy-pi-catalog-process',
    buildStart() {
      this.addWatchFile(source)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'piCatalogProcess.mjs',
        source: readFileSync(source, 'utf-8'),
      })
    },
  }
}

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
      // electron-vite externalizeDeps is enabled by default. Both SDKs are
      // ESM-only (no CJS export condition) and are reached only via dynamic
      // import(), never a static import/require.
      //
      // @openai/codex-sdk is bundled: it has no runtime plugin system, so a
      // self-contained bundle is fine.
      //
      // @earendil-works/pi-coding-agent MUST stay externalized. It loads pi
      // extensions at runtime with jiti, which resolves each extension's own
      // dependencies (e.g. `typebox`) from pi's node_modules. Bundling pi into
      // dist/main roots that resolution at the built chunk, where those deps
      // don't exist, so every pi extension — including pi-cursor-sdk, which
      // registers the `cursor` provider and its models — fails to load with
      // "Cannot find module 'typebox'". Externalized, pi runs from node_modules
      // with its dependency tree intact.
      //
      // jira.js is bundled because v6 is ESM-only and this bundle is CJS, so
      // left external it would be reached by require(). It is plain fetch code
      // with nothing to resolve at runtime.
      externalizeDeps: { exclude: ['@openai/codex-sdk', 'jira.js'] },
      // Compile to V8 bytecode in production for source protection
      bytecode: isProduction,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts')
        }
      }
    },
    plugins: [copyPiCatalogProcess()],
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
      // zod must be bundled: the sandboxed preload can't require() node_modules packages
      externalizeDeps: { exclude: ['zod'] },
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
    // Dev-server only. These packages are reached exclusively through a lazy
    // `import()`, so the first optimize pass at server start doesn't cover
    // them: Vite discovers them the moment the feature is first used, re-bundles
    // every dependency, and the import that triggered the discovery fails with
    // "Failed to fetch dynamically imported module" — taking down whichever
    // panel rendered it. Naming them here puts them in the first pass instead.
    // A package only belongs on this list while nothing imports it statically.
    optimizeDeps: {
      include: [
        'mermaid',
        'dompurify',
        'monaco-editor',
        '@monaco-editor/react'
      ]
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
