
/**
 */
    const { projectId, path: sourcePath, filename } = AttachmentSchemas.add.parse(params);

  });

    const { attachmentId } = AttachmentSchemas.remove.parse(params);

  });

    const { projectId } = AttachmentSchemas.list.parse(params);
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
