
/**
 */
  });

  });

  });

    const mainWindow = getMainWindow();
    if (!mainWindow) return [];

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Files',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    return result.filePaths;
  });
}
