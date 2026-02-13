import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../channels';



  // ==========================================================================
  // Context Files (all .md files in project root)
  // ==========================================================================

  // List all context files in project root

  // Read a context file by relative path

  // Write a context file by relative path

  // Delete a context file by relative path

  // Import a file as context (copy to project root)

  // Show file dialog to select files for import
    const mainWindow = getMainWindow();

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Context Files',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
}
