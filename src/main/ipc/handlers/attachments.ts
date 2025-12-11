
/**
 * Register attachment handlers.
 * @param getMainWindow window getter for dialogs
 */
export function registerAttachmentHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
    const { projectId, path: sourcePath, filename } = AttachmentSchemas.add.parse(params);

    return unwrapOrThrow(await attachmentService.add(projectId, sourcePath, filename));
  });

    const { attachmentId } = AttachmentSchemas.remove.parse(params);

    const result = await attachmentService.remove(attachmentId);
  });

    const { projectId } = AttachmentSchemas.list.parse(params);
    return unwrapOrThrow(attachmentService.list(projectId));
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
