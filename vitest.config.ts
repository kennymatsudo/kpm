import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Global test configuration
    globals: true,
    environment: 'node',

    // Test file patterns
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'packages/*/src/**/*.test.ts',
    ],

    // Setup files run before each test file
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/main/**/*.ts',
        'src/shared/**/*.ts',
        'packages/*/src/**/*.ts',
      ],
      exclude: [
        'src/main/index.ts',        // Electron entry point
        'src/preload/**',           // Preload scripts
        'src/renderer/**',          // Renderer (tested separately)
        '**/*.d.ts',
        '**/node_modules/**',
      ],
    },

    // Type checking
    typecheck: {
      enabled: false,  // Use separate tsc for type checking
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@main': path.resolve(__dirname, './src/main'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
