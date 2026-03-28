import { useState, useCallback, useEffect } from 'react';
import { subscribe as subscribeToStoreEvent } from '../../../stores/storeEvents';
import { getImageMimeType, uint8ArrayToDataUrl } from '../../../utils/image';
import { readProjectBinaryFile, readWorkspaceFile, writeProjectFile } from '../../../services/workspaceFileService';
import type { FileNode } from '../../../../shared/types';

interface FileViewersDeps {
  projectId: string;
}

interface ImageViewerState {
  path: string;
  filename: string;
  dataUrl: string;
  size: number;
}

export function useFileViewers({ projectId }: FileViewersDeps) {
  const [viewingPath, setViewingPath] = useState<string | null>(null);
  const [viewingContent, setViewingContent] = useState('');
  const [viewingImage, setViewingImage] = useState<ImageViewerState | null>(null);

  // Subscribe to bridged AI file updates to keep viewer in sync
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('chat-file-updated', (event) => {
      const data = event.payload;
      if (data.projectId === projectId && data.filePath === viewingPath) {
        setViewingContent(data.content);
      }
    });
    return unsubscribe;
  }, [projectId, viewingPath]);

  const openMarkdownViewer = useCallback(
    async (path: string) => {
      if (!path || !projectId) return;
      try {
        const content = await readWorkspaceFile('project', path, projectId);
        setViewingContent(content);
        setViewingPath(path);
      } catch (err) {
        console.error('Failed to load markdown file:', err);
      }
    },
    [projectId]
  );

  const openImageViewer = useCallback(
    async (path: string, node: FileNode) => {
      try {
        const data = await readProjectBinaryFile(projectId, path);
        const mimeType = getImageMimeType(node.name);
        const dataUrl = uint8ArrayToDataUrl(new Uint8Array(data), mimeType);
        setViewingImage({
          path,
          filename: node.name,
          dataUrl,
          size: data.length,
        });
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    },
    [projectId]
  );

  const closeViewer = useCallback(() => {
    setViewingPath(null);
    setViewingContent('');
  }, []);

  const closeImageViewer = useCallback(() => {
    setViewingImage(null);
  }, []);

  const saveMarkdown = useCallback(
    async (newContent: string) => {
      if (!viewingPath || !projectId) return;
      try {
        const result = await writeProjectFile(projectId, viewingPath, newContent);
        if (result.success) {
          setViewingContent(newContent);
          closeViewer();
        }
      } catch (err) {
        console.error('Failed to save markdown file:', err);
      }
    },
    [viewingPath, projectId, closeViewer]
  );

  /** Called by the file-explorer-changed event handler to update viewer state */
  function handleFileChange(type: string, path: string, newPath?: string): void {
    switch (type) {
      case 'updated':
        if (path === viewingPath) {
          readWorkspaceFile('project', path, projectId)
            .then((content: string) => {
              setViewingContent(content);
            })
            .catch(console.error);
        }
        break;
      case 'deleted':
        if (path === viewingPath) {
          setViewingPath(null);
          setViewingContent('');
        }
        break;
      case 'renamed':
        if (path === viewingPath && newPath) {
          setViewingPath(newPath);
        }
        break;
    }
  }

  /** Close viewer if the deleted file was being viewed */
  function closeIfViewing(path: string): void {
    if (viewingPath === path) {
      setViewingPath(null);
      setViewingContent('');
    }
  }

  return {
    viewingPath,
    viewingContent,
    viewingImage,
    setViewingContent,
    openMarkdownViewer,
    openImageViewer,
    closeViewer,
    closeImageViewer,
    saveMarkdown,
    handleFileChange,
    closeIfViewing,
  };
}
