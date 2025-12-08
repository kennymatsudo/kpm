import path from 'path';
import { initDatabase } from './db';


  initDatabase();

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

