import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { ProjectRepository } from './ProjectRepository';

const realFs = {
  existsSync,
  mkdirSync,
  writeFileSync,
};

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'kpm-project-repo-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('ProjectRepository.create', () => {
  it('creates a folder the user named but had not made yet', () => {
    const db = createTestDb();
    try {
      const userDataPath = makeTempDir();
      const target = path.join(makeTempDir(), 'not-yet-there');

      const repo = new ProjectRepository(db, userDataPath, realFs, path);
      const project = repo.create({ name: 'Intended', folderPath: target });

      expect(project.folder_path).toBe(target);
      expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    } finally {
      db.close();
    }
  });

  it('derives a folder under the managed projects root when none is given', () => {
    const db = createTestDb();
    try {
      const userDataPath = makeTempDir();

      const repo = new ProjectRepository(db, userDataPath, realFs, path);
      const project = repo.create({ name: 'No Folder Given' });

      expect(path.dirname(project.folder_path)).toBe(path.join(userDataPath, 'projects'));
      expect(existsSync(path.join(project.folder_path, 'AGENTS.md'))).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('ProjectRepository.delete', () => {
  it('drops the record but leaves the project folder and its files on disk', () => {
    const db = createTestDb();
    try {
      const userDataPath = makeTempDir();
      const folderPath = makeTempDir();
      const userFile = path.join(folderPath, 'notes.md');
      writeFileSync(userFile, 'work the user owned before KPM saw it', 'utf-8');

      const repo = new ProjectRepository(db, userDataPath, realFs, path);
      const project = repo.create({ name: 'Adopted folder', folderPath });

      repo.delete(project.id);

      expect(repo.get(project.id)).toBeUndefined();
      expect(existsSync(folderPath)).toBe(true);
      expect(existsSync(userFile)).toBe(true);
    } finally {
      db.close();
    }
  });
});
