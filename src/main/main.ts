import path from 'path';
import { execSync } from 'child_process';
import { initDatabase } from './db';
import * as TempImageService from './services/files/TempImageService';
import { warmupMcpSdk } from './claude/tools/createKpmServer';

// Fix PATH for production builds launched from Finder
function fixPath(): void {

  const currentPath = process.env.PATH || '';
  const pathSet = new Set(currentPath.split(path.delimiter));

  // Add paths that don't already exist
  const newPaths = additionalPaths.filter(p => !pathSet.has(p));
  if (newPaths.length > 0) {
    process.env.PATH = [...newPaths, currentPath].join(path.delimiter);
    console.log('[Main] Extended PATH with:', newPaths.join(', '));
  }
}

// E2E launches (NODE_ENV=test) pass an isolated --user-data-dir; honor it so tests
// never touch the real database — the pin would otherwise override the flag.
const e2eDataDir = process.env.NODE_ENV === 'test'
  ? app.commandLine.getSwitchValue('user-data-dir')
  : '';
app.setPath('userData', e2eDataDir || path.join(app.getPath('appData'), 'KPM - Planning Workbench'));
// Fix PATH immediately at startup
fixPath();



void app.whenReady().then(async () => {
  initDatabase();

  // Clean up legacy global MCP registration (from before in-process tools migration)
  // This is idempotent - removing non-existent registration just fails quietly
  try {
    execSync('npx @anthropic-ai/claude-code mcp remove kpm --scope user', { stdio: 'ignore' });
  } catch {
    // Expected if not registered globally
  }

  // Initialize temp image service (creates temp directory, cleans up stale files)
  await TempImageService.init();

  // The Claude Agent SDK registers process exit handlers per query() call.
  // With multi-session support (up to 3 concurrent sessions), this exceeds
  // Node's default limit of 10. Raise it to accommodate concurrent sessions.
  process.setMaxListeners(20);


  registerAllIpcHandlers(getMainWindow, services);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

});

