/**
 * File and File Explorer Validation Schemas
 */

import { contextEndpoints } from '../../../shared/ipc/contextEndpoints';
import { fileExplorerEndpoints } from '../../../shared/ipc/fileExplorerEndpoints';

// =============================================================================
// File Schemas (Context Files)
//
// Payload schemas are owned by `shared/ipc/contextEndpoints.ts` (one entry
// per IPC endpoint, shared with the preload bridge and the handler binding).
// This map only translates the endpoint registry's dotted keys to the names
// `ContextFileService`-adjacent callers already use.
// =============================================================================

export const FileSchemas = {
  read: contextEndpoints['claudeMd.read'].params,
  write: contextEndpoints['claudeMd.write'].params,
  listContext: contextEndpoints['context.list'].params,
  readContext: contextEndpoints['context.read'].params,
  writeContext: contextEndpoints['context.write'].params,
  deleteContext: contextEndpoints['context.delete'].params,
  importContext: contextEndpoints['context.import'].params,
};

// =============================================================================
// File Explorer Schemas
//
// Payload schemas are owned by `shared/ipc/fileExplorerEndpoints.ts` (one
// entry per IPC endpoint, shared with the preload bridge and the handler
// binding). This map only translates the endpoint registry's dotted keys to
// the names `FileExplorerService`-adjacent callers already use.
// =============================================================================

export const FileExplorerSchemas = {
  listDirectory: fileExplorerEndpoints.listDirectory.params,
  createFolder: fileExplorerEndpoints.createFolder.params,
  createFile: fileExplorerEndpoints.createFile.params,
  createBinaryFile: fileExplorerEndpoints.createBinaryFile.params,
  copyExternalFile: fileExplorerEndpoints.copyExternalFile.params,
  createSymlink: fileExplorerEndpoints.createSymlink.params,
  deleteEntry: fileExplorerEndpoints.delete.params,
  rename: fileExplorerEndpoints.rename.params,
  getInfo: fileExplorerEndpoints.getInfo.params,
  readFile: fileExplorerEndpoints.readFile.params,
  readBinaryFile: fileExplorerEndpoints.readBinaryFile.params,
  writeFile: fileExplorerEndpoints.writeFile.params,
  getSymlinkInfo: fileExplorerEndpoints.getSymlinkInfo.params,
  showItemInFolder: fileExplorerEndpoints.showItemInFolder.params,
  openInEditor: fileExplorerEndpoints.openInEditor.params,
  selectFolderDialog: fileExplorerEndpoints.selectFolderDialog.params,
  watchProject: fileExplorerEndpoints.watchProject.params,
  unwatchProject: fileExplorerEndpoints.unwatchProject.params,
};
