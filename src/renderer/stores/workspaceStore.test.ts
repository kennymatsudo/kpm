import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore, documentId } from './workspaceStore';

const writeWorkspaceFile = vi.hoisted(() => vi.fn());
const readWorkspaceFile = vi.hoisted(() => vi.fn());
vi.mock('../services/workspaceFileService', () => ({ writeWorkspaceFile, readWorkspaceFile }));

const readPersistedDocuments = vi.hoisted(() => vi.fn());
const writePersistedDocuments = vi.hoisted(() => vi.fn());
vi.mock('./workspaceDocumentPersistence', () => ({
  readPersistedDocuments,
  writePersistedDocuments,
}));

const store = () => useWorkspaceStore.getState();
const idOf = (path: string) => documentId('project', path);
const openPaths = () => store().openDocuments.map((document) => document.path);

beforeEach(() => {
  writeWorkspaceFile.mockReset();
  writeWorkspaceFile.mockResolvedValue(undefined);
  readWorkspaceFile.mockReset();
  readWorkspaceFile.mockImplementation(async (_source: string, path: string) => `body of ${path}`);
  readPersistedDocuments.mockReset();
  readPersistedDocuments.mockReturnValue(null);
  writePersistedDocuments.mockReset();
  store().reset();
  store().setCurrentProjectId('p1');
});

describe('openDocument', () => {
  it('appends each new document and activates it', () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');

    expect(openPaths()).toEqual(['a.md', 'b.md']);
    expect(store().activeDocumentId).toBe(idOf('b.md'));
  });

  it('activates the existing tab instead of opening a second one', () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');
    store().openDocument('project', 'a.md', 'A');

    expect(openPaths()).toEqual(['a.md', 'b.md']);
    expect(store().activeDocumentId).toBe(idOf('a.md'));
  });

  it('keeps an unsaved buffer when the same file is opened again', () => {
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    store().openDocument('project', 'a.md', 'on disk');

    expect(store().openDocuments[0]?.content).toBe('my edit');
  });

  it('adopts freshly read content when the tab is clean', () => {
    store().openDocument('project', 'a.md', 'old');
    store().openDocument('project', 'a.md', 'new');

    expect(store().openDocuments[0]?.content).toBe('new');
    expect(store().openDocuments[0]?.originalContent).toBe('new');
  });

  it('tells project files apart from an identically named repo file', () => {
    store().openDocument('project', 'README.md', 'project');
    store().openDocument('repo-1', 'README.md', 'repo');

    expect(store().openDocuments).toHaveLength(2);
  });
});

describe('closeDocument', () => {
  it('hands the active slot to the tab that took its place', async () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');
    store().openDocument('project', 'c.md', 'C');
    store().setActiveDocument(idOf('b.md'));

    await store().closeDocument(idOf('b.md'));

    expect(openPaths()).toEqual(['a.md', 'c.md']);
    expect(store().activeDocumentId).toBe(idOf('c.md'));
  });

  it('falls back to the left neighbour when the last tab closes', async () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');

    await store().closeDocument(idOf('b.md'));

    expect(store().activeDocumentId).toBe(idOf('a.md'));
  });

  it('leaves nothing active once the strip is empty', async () => {
    store().openDocument('project', 'a.md', 'A');

    await store().closeDocument(idOf('a.md'));

    expect(store().openDocuments).toEqual([]);
    expect(store().activeDocumentId).toBeNull();
  });

  it('keeps the active tab when a background tab closes', async () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');

    await store().closeDocument(idOf('a.md'));

    expect(store().activeDocumentId).toBe(idOf('b.md'));
  });

  it('writes an unsaved buffer out rather than discarding it', async () => {
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    await store().closeDocument(idOf('a.md'));

    expect(writeWorkspaceFile).toHaveBeenCalledWith('project', 'a.md', 'my edit', 'p1');
    expect(store().openDocuments).toEqual([]);
  });

  it('keeps the tab open when that write fails', async () => {
    writeWorkspaceFile.mockRejectedValue(new Error('disk full'));
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    await store().closeDocument(idOf('a.md'));

    expect(openPaths()).toEqual(['a.md']);
    expect(store().openDocuments[0]?.content).toBe('my edit');
    expect(store().openDocuments[0]?.saveError).toContain('disk full');
  });
});

describe('discardDocument', () => {
  it('closes without writing, for a file that is gone from disk', () => {
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    store().discardDocument(idOf('a.md'));

    expect(store().openDocuments).toEqual([]);
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe('saveDocument', () => {
  it('leaves the document dirty when it was edited during the write', async () => {
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'first');

    writeWorkspaceFile.mockImplementation(async () => {
      store().updateContent(idOf('a.md'), 'first and more');
    });

    expect(await store().saveDocument(idOf('a.md'))).toBe(true);

    const document = store().openDocuments[0];
    // Only what actually reached disk counts as saved, so autosave comes back
    // for the rest instead of the tail of the edit being lost.
    expect(document?.originalContent).toBe('first');
    expect(document?.content).toBe('first and more');
  });

  it('skips the write when nothing changed', async () => {
    store().openDocument('project', 'a.md', 'A');

    expect(await store().saveDocument(idOf('a.md'))).toBe(true);
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it('clears a previous error on the next attempt', async () => {
    writeWorkspaceFile.mockRejectedValueOnce(new Error('disk full'));
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    await store().saveDocument(idOf('a.md'));
    expect(store().openDocuments[0]?.saveError).toContain('disk full');

    await store().saveDocument(idOf('a.md'));
    expect(store().openDocuments[0]?.saveError).toBeNull();
  });
});

describe('renameDocument', () => {
  it('follows the file to its new path, buffer intact', () => {
    store().openDocument('project', 'a.md', 'on disk');
    store().updateContent(idOf('a.md'), 'my edit');

    store().renameDocument(idOf('a.md'), 'notes/a.md');

    const document = store().openDocuments[0];
    expect(document?.id).toBe(idOf('notes/a.md'));
    expect(document?.path).toBe('notes/a.md');
    expect(document?.content).toBe('my edit');
    expect(store().activeDocumentId).toBe(idOf('notes/a.md'));
  });

  it('drops the tab when its new path is already open', () => {
    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');

    store().renameDocument(idOf('a.md'), 'b.md');

    expect(openPaths()).toEqual(['b.md']);
  });
});

describe('resetProjectState', () => {
  it('clears the strip on a project switch', () => {
    store().openDocument('project', 'a.md', 'A');

    store().resetProjectState();

    expect(store().openDocuments).toEqual([]);
    expect(store().activeDocumentId).toBeNull();
  });
});

describe('hydrateOpenDocuments', () => {
  it('reopens the documents in the order they were in', async () => {
    readPersistedDocuments.mockReturnValue({
      open: [
        { source: 'project', path: 'a.md' },
        { source: 'project', path: 'b.md' },
      ],
      active: idOf('a.md'),
    });

    await store().hydrateOpenDocuments('p1');

    expect(openPaths()).toEqual(['a.md', 'b.md']);
    expect(store().openDocuments[0]?.content).toBe('body of a.md');
    expect(store().activeDocumentId).toBe(idOf('a.md'));
  });

  it('leaves out a file that is no longer readable', async () => {
    readPersistedDocuments.mockReturnValue({
      open: [
        { source: 'project', path: 'gone.md' },
        { source: 'project', path: 'b.md' },
      ],
      active: idOf('gone.md'),
    });
    readWorkspaceFile.mockImplementation(async (_source: string, path: string) => {
      if (path === 'gone.md') throw new Error('ENOENT');
      return `body of ${path}`;
    });

    await store().hydrateOpenDocuments('p1');

    expect(openPaths()).toEqual(['b.md']);
    // The remembered tab never came back, so the last one opened stands in.
    expect(store().activeDocumentId).toBe(idOf('b.md'));
  });

  it('reads a repo file without the project id', async () => {
    readPersistedDocuments.mockReturnValue({
      open: [{ source: 'repo-1', path: 'src/main.ts' }],
      active: null,
    });

    await store().hydrateOpenDocuments('p1');

    expect(readWorkspaceFile).toHaveBeenCalledWith('repo-1', 'src/main.ts', null);
  });

  it('restores nothing when this project was never used', async () => {
    await store().hydrateOpenDocuments('p1');

    expect(store().openDocuments).toEqual([]);
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  it('abandons the restore when another project has been loaded', async () => {
    readPersistedDocuments.mockReturnValue({
      open: [{ source: 'project', path: 'a.md' }],
      active: null,
    });

    await store().hydrateOpenDocuments('p1', () => false);

    expect(store().openDocuments).toEqual([]);
  });
});

describe('tab arrangement persistence', () => {
  it('records the open documents and the active one', async () => {
    await store().hydrateOpenDocuments('p1');

    store().openDocument('project', 'a.md', 'A');
    store().openDocument('project', 'b.md', 'B');

    expect(writePersistedDocuments).toHaveBeenLastCalledWith('p1', {
      open: [
        { source: 'project', path: 'a.md' },
        { source: 'project', path: 'b.md' },
      ],
      active: idOf('b.md'),
    });
  });

  it('records nothing for content changes, only for arrangement', async () => {
    await store().hydrateOpenDocuments('p1');
    store().openDocument('project', 'a.md', 'A');
    writePersistedDocuments.mockClear();

    store().updateContent(idOf('a.md'), 'typing');
    store().updateContent(idOf('a.md'), 'typing more');

    expect(writePersistedDocuments).not.toHaveBeenCalled();
  });

  it('stays quiet until a project has been hydrated', () => {
    store().openDocument('project', 'a.md', 'A');

    expect(writePersistedDocuments).not.toHaveBeenCalled();
  });
});
