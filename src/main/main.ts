import path from 'path';
import { execSync } from 'child_process';
import { initDatabase } from './db';


void app.whenReady().then(async () => {
  initDatabase();

  // This is idempotent - removing non-existent registration just fails quietly
  try {
    execSync('npx @anthropic-ai/claude-code mcp remove kpm --scope user', { stdio: 'ignore' });
  } catch {
    // Expected if not registered globally
  }

  // Initialize temp image service (creates temp directory, cleans up stale files)
  await TempImageService.init();

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

