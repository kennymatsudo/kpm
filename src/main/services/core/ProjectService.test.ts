import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectService } from './ProjectService';
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

    const service = createProjectService({
      projects: createStubProjectRepo(),
      appSettings: createMockAppSettings(),
      openPath: async () => '',
    });

    const result = await service.create({ name: 'Support Pane', folderPath: target });
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(target, 'README.md'), 'utf-8')).toBe('# already here');
  });

  it('rejects a non-existent folderPath', async () => {
    const parent = freshTempDir();
    const target = path.join(parent, 'does-not-exist');

    const service = createProjectService({
      projects: createStubProjectRepo(),
      appSettings: createMockAppSettings(),
      openPath: async () => '',
    });

    const result = await service.create({ name: 'Missing', folderPath: target });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not exist/);
  });
});

describe('ProjectService.getDefaultLocation', () => {
  it('returns the ~/Documents/KPM Projects default', () => {
    const service = createProjectService({
      projects: createStubProjectRepo(),
      appSettings: createMockAppSettings(),
      openPath: async () => '',
    });

    const result = service.getDefaultLocation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.defaultLocation).toMatch(/Documents[/\\]KPM Projects$/);
    }
  });
});
