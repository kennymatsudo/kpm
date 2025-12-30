/**
 * Global test setup file
 *
 * This file runs before each test file and sets up:
 * - sql.js initialization (WASM-based SQLite for tests)
 * - Mock for better-sqlite3 (uses sql.js adapter)
 * - Mocks for Electron APIs
 * - Mocks for Node.js modules that don't work in test environment
 * - Global test utilities
 */

import { vi, beforeEach, afterEach, expect } from 'vitest';

// =============================================================================
// sql.js Initialization (MUST be first)
// =============================================================================

// Import and initialize sql.js before any better-sqlite3 usage
import { initializeSqlJs, Database } from './mocks/sqljs-adapter';

// Initialize sql.js synchronously at module load time using top-level await
await initializeSqlJs();

// =============================================================================
// better-sqlite3 Mock (uses sql.js adapter)
// =============================================================================

// Mock better-sqlite3 to use our sql.js adapter
// This allows all code that imports better-sqlite3 to work without native compilation
vi.mock('better-sqlite3', () => {
  return {
    default: Database,
    Database: Database,
  };
});

// =============================================================================
// Electron Mocks
// =============================================================================

// Mock electron module - must be done before any imports that use it
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case 'userData':
          return '/tmp/kpm-test-data';
        case 'home':
          return '/tmp/home';
        case 'documents':
          return '/tmp/documents';
        default:
          return `/tmp/${name}`;
      }
    }),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    quit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
    on: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  })),
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));

// =============================================================================
// Node.js Module Mocks
// =============================================================================

// Mock keytar (OS keychain) - native module that doesn't work in tests
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
    findCredentials: vi.fn().mockResolvedValue([]),
  },
  getPassword: vi.fn().mockResolvedValue(null),
  setPassword: vi.fn().mockResolvedValue(undefined),
  deletePassword: vi.fn().mockResolvedValue(true),
  findCredentials: vi.fn().mockResolvedValue([]),
}));

// =============================================================================
// Global Test Utilities
// =============================================================================

// Clean up mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Global Type Declarations
// =============================================================================

// Extend the global scope for test utilities
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion {
      toBeUUID(): void;
    }
  }
}

// Custom matcher for UUID validation
expect.extend({
  toBeUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },
});
