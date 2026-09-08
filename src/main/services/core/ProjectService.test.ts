import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectService } from './ProjectService';
import { deriveProjectFolderPath } from '../../project-context/projectFolder';
import type { IAppSettingsRepository } from '../../db/interfaces/settings';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { Project } from '../../../shared/types';

function createMockAppSettings(): IAppSettingsRepository {
  const store = new Map<string, string>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => { store.set(key, value); },
    delete: (key) => { store.delete(key); },
    getAll: () => Object.fromEntries(store),
  };
}

function createStubProjectRepo(): IProjectRepository {
  return {
    create: ({ name, folderPath }) => ({
      id: 'pid',
      name,
      folder_path: folderPath ?? '/legacy',
    } as Project),
    get: () => undefined,
    list: () => [],
    update: () => {},
    updateTokens: () => {},
    resetTokens: () => {},
    updateStorybookUrl: () => {},
    updateContextDirectories: () => {},
    getContextDirectories: () => null,
    delete: () => {},
  };
}

function makeService(userDataPath = '/user-data') {
  return createProjectService({
    projects: createStubProjectRepo(),
    appSettings: createMockAppSettings(),
    userDataPath,
    openPath: async () => '',
  });
}

describe('ProjectService.create', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function freshTempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'project-svc-'));
    tempDirs.push(dir);
    return dir;
  }

  it('accepts an existing folder and does not touch its contents', async () => {
    const parent = freshTempDir();
    const target = path.join(parent, 'support-pane');
    mkdirSync(target);
    writeFileSync(path.join(target, 'README.md'), '# already here', 'utf-8');

    const result = await makeService().create({ name: 'Support Pane', folderPath: target });

    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(target, 'README.md'), 'utf-8')).toBe('# already here');
  });

  it('accepts a folder that does not exist yet, leaving creation to the repository', async () => {
    const target = path.join(freshTempDir(), 'not-yet-there');

    const result = await makeService().create({ name: 'Intended', folderPath: target });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.folder_path).toBe(target);
  });

  it('rejects a folderPath that names an existing file', async () => {
    const target = path.join(freshTempDir(), 'notes.md');
    writeFileSync(target, 'not a folder', 'utf-8');

    const result = await makeService().create({ name: 'File', folderPath: target });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a folder/);
  });

  it('expands a leading ~ before handing the path to the repository', async () => {
    const result = await makeService().create({ name: 'Tilde', folderPath: '~/kpm-tilde-target' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.folder_path).toBe(path.join(homedir(), 'kpm-tilde-target'));
  });
});

describe('ProjectService.getDefaultLocation', () => {
  it('reports the same root the repository actually derives folders under', () => {
    const userDataPath = '/user-data';

    const result = makeService(userDataPath).getDefaultLocation();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const derived = deriveProjectFolderPath(userDataPath, 'Some Project', 'abc12345-0000');
      expect(path.dirname(derived)).toBe(result.data.defaultLocation);
    }
  });
});

describe('ProjectService.inspectFolder', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function freshTempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'project-svc-inspect-'));
    tempDirs.push(dir);
    return dir;
  }

  it('flags a folder holding a .git entry', async () => {
    const target = freshTempDir();
    mkdirSync(path.join(target, '.git'));

    const result = await makeService().inspectFolder(target);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.isGitRepo).toBe(true);
      expect(result.data.isEmpty).toBe(false);
      expect(result.data.isDirectory).toBe(true);
    }
  });

  it('reports an empty folder as adoptable and not a repo', async () => {
    const result = await makeService().inspectFolder(freshTempDir());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ exists: true, isDirectory: true, isGitRepo: false, isEmpty: true });
    }
  });

  it('resolves ~ and reports a missing folder without throwing', async () => {
    const result = await makeService().inspectFolder('~/kpm-definitely-not-here-9f3c');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.resolvedPath).toBe(path.join(homedir(), 'kpm-definitely-not-here-9f3c'));
      expect(result.data.exists).toBe(false);
    }
  });

  it('reports an existing file as not a directory', async () => {
    const target = path.join(freshTempDir(), 'notes.md');
    writeFileSync(target, 'a file', 'utf-8');

    const result = await makeService().inspectFolder(target);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ exists: true, isDirectory: false });
  });
});
