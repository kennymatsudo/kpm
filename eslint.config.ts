import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['**/dist/**', '.vite/**', '.claude/**', 'packages/**', 'scripts/**', 'release/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'v4-backup/**'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript type-aware + stylistic rules
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  // Import plugin — native flat config (no FlatCompat shim needed)
  importX.flatConfigs.recommended,
  importX.flatConfigs.electron,
  importX.flatConfigs.typescript,

  // Main config — applies to all TS/TSX files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: './tsconfig.json',
        }),
      ],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', {
        ignoreArrowShorthand: true,
      }],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },

  // Config files — import resolver doesn't know about vite/electron-vite internals
  {
    files: ['*.config.ts'],
    rules: {
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // Claude SDK integration — SDK uses `any` extensively; unsafe rules add no signal here
  {
    files: ['src/main/claude/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // DB layer — better-sqlite3 results are untyped; unsafe rules add no signal here
  {
    files: ['src/main/db/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // IPC handlers — async handlers are registered as sync callbacks by Electron
  {
    files: ['src/main/ipc/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Renderer — event handler attributes can't be awaited; misused-promises adjusted
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: { attributes: false },
      }],
      'no-restricted-properties': ['error', {
        object: 'window',
        property: 'api',
        message: 'Use a renderer service instead of accessing window.api directly outside src/renderer/services.',
      }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // Renderer services are the transport boundary for preload IPC
  {
    files: ['src/renderer/services/**/*.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },

  // Services — mixed JS/TS interop with external APIs
  {
    files: ['src/main/services/**/*.ts'],
    rules: {
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  // Trackers / tracker clients — external Jira/Linear APIs are loosely typed
  {
    files: ['src/main/trackers/**/*.ts', 'src/main/tracker-clients/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // Tests
  {
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Test mocks
  {
    files: ['tests/mocks/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'import-x/no-unresolved': 'off',
    },
  },
);
