import { app, BrowserWindow, dialog, screen } from 'electron';
import path from 'path';
import { initDatabase } from './db';
import { registerAllIpcHandlers } from './ipc';
import * as TempImageService from './services/files/TempImageService';
import { initializeRepositoryContainer } from './db/container';
import { warmupMcpSdk } from './kpmTools/createKpmServer';
import { initializeServices } from './services/container';
import { getCommonDevToolPaths } from './claude/findClaude';
import { initClaudeAvailability } from './claude/availabilityState';
import type { IRepositoryContainer } from './db/interfaces';
import type { AppServices } from './services/appServices';
import { default as installExtension, REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { createMainWindowManager } from './bootstrap/windowManager';
import { buildApplicationMenu } from './bootstrap/menu';
import { applyDockIcon, watchSystemAppearance } from './bootstrap/dockIcon';

// Fix PATH for production builds launched from Finder
// macOS GUI apps get minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin), which
// breaks shell commands and user-configured stdio MCP servers that rely on
// node/npx/homebrew tools being resolvable.
function fixPath(): void {
  const additionalPaths = getCommonDevToolPaths();

  const currentPath = process.env.PATH || '';
  const pathSet = new Set(currentPath.split(path.delimiter));

  // Add paths that don't already exist
  const newPaths = additionalPaths.filter(p => !pathSet.has(p));
  if (newPaths.length > 0) {
    process.env.PATH = [...newPaths, currentPath].join(path.delimiter);
    console.log('[Main] Extended PATH with:', newPaths.join(', '));
  }
}

// Pin userData explicitly to avoid resolution drift if productName ever changes.
// Must run before any app.getPath('userData') call (which happens during initDatabase).
// E2E launches (NODE_ENV=test) pass an isolated --user-data-dir; honor it so tests
// never touch the real database — the pin would otherwise override the flag.
const e2eDataDir = process.env.NODE_ENV === 'test'
  ? app.commandLine.getSwitchValue('user-data-dir')
  : '';
app.setPath('userData', e2eDataDir || path.join(app.getPath('appData'), 'KPM - Planning Workbench'));

// Override the process name so the Dock tooltip and menu bar show "KPM"
// in dev mode (where the binary is the system Electron process).
app.setName('KPM');

// Fix PATH immediately at startup
fixPath();

// Set the Dock icon to match the current macOS appearance, synchronously at
// module load so the tile is already correct by the time it appears (in dev the
// running binary is the system Electron, which would otherwise flash its own
// logo). Tracks the system light/dark setting, not KPM's in-app theme.
applyDockIcon();

// Probe Claude reachability once after PATH fixup. Cached so any IPC handler
// or service can inspect it without re-walking the filesystem.
const claudeAvailability = initClaudeAvailability();
switch (claudeAvailability.status) {
  case 'bundled':
    console.log('[Main] Claude binary:', claudeAvailability.binaryPath);
    break;
  case 'path-fallback':
    console.warn('[Main] Claude binary fallback to PATH:', claudeAvailability.binaryPath, '—', claudeAvailability.reason);
    break;
  case 'unreachable':
    console.error('[Main] Claude binary unreachable:', claudeAvailability.reason);
    break;
}

let runtimeRepositories: Pick<IRepositoryContainer, 'appSettings' | 'projects'> | null = null;
let runtimeServices: AppServices | null = null;

function getRuntimeRepositories(): Pick<IRepositoryContainer, 'appSettings' | 'projects'> {
  if (!runtimeRepositories) {
    throw new Error('[Main] Runtime repositories accessed before initialization');
  }
  return runtimeRepositories;
}

function saveWindowBounds(bounds: Electron.Rectangle): void {
  const { appSettings } = getRuntimeRepositories();
  appSettings.set('window_bounds', JSON.stringify(bounds));
}

function loadWindowBounds(): Electron.Rectangle | null {
  const { appSettings } = getRuntimeRepositories();
  const saved = appSettings.get('window_bounds');
  if (!saved) return null;

  try {
    const bounds = JSON.parse(saved) as Electron.Rectangle;
    // Validate bounds are on a visible display
    const displays = screen.getAllDisplays();
    const isVisible = displays.some(display => {
      const { x, y, width, height } = display.bounds;
      return bounds.x >= x && bounds.x < x + width &&
             bounds.y >= y && bounds.y < y + height;
    });
    return isVisible ? bounds : null;
  } catch {
    return null;
  }
}

const { createWindow, getMainWindow } = createMainWindowManager({
  loadWindowBounds,
  saveWindowBounds,
});

void app.whenReady().then(async () => {
  // Install React DevTools extension in dev mode
  if (!app.isPackaged) {
    try {
      await installExtension(REACT_DEVELOPER_TOOLS);
      console.log('[Main] Installed React DevTools extension');
    } catch (err) {
      console.warn('[Main] Failed to install React DevTools:', err);
    }
  }

  initDatabase();

  // Initialize temp image service (creates temp directory, cleans up stale files)
  await TempImageService.init();

  // The Claude Agent SDK registers process exit handlers per query() call.
  // With multi-session support (up to 3 concurrent sessions), this exceeds
  // Node's default limit of 10. Raise it to accommodate concurrent sessions.
  process.setMaxListeners(20);

  const container = initializeRepositoryContainer();
  runtimeRepositories = {
    appSettings: container.appSettings,
    projects: container.projects,
  };
  const services = initializeServices(container);
  runtimeServices = services;
  services.appLifecycleService.start();

  // Pre-build the KPM tool array at app startup so the first session start
  // doesn't pay the initialization cost during an active user interaction.
  warmupMcpSdk({
    container,
    services,
    getMainWindow,
  });

  registerAllIpcHandlers(getMainWindow, services);
  createWindow();
  // Keep the Dock icon following the macOS light/dark setting while running.
  watchSystemAppearance();
  buildApplicationMenu({
    getMainWindow,
    getRecentProjects: () => getRuntimeRepositories().projects.list(),
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err: unknown) => {
  // Without this, a boot failure (e.g. a migration error) becomes an
  // unhandled rejection and the app hangs with no window.
  const message = err instanceof Error ? err.message : String(err);
  console.error('[Main] Startup failed:', message);
  dialog.showErrorBox('KPM failed to start', message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Perform async cleanup before quitting so watcher unsubscribe ops can complete
// before Electron tears down the NAPI environment (prevents napi_fatal_error crash).
let cleanupDone = false;
app.on('before-quit', (event) => {
  if (cleanupDone) return;
  event.preventDefault();
  cleanupDone = true;

  const cleanup = runtimeServices?.appLifecycleService.shutdown() ?? Promise.resolve();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  Promise.race([cleanup, timeout])
    .catch((err) => console.error('[Main] Shutdown cleanup error:', err))
    .finally(() => app.quit());
});

export { getMainWindow };
