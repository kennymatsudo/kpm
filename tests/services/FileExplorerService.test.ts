import fs from 'fs';
import path from 'path';
import os from 'os';
import { createFileExplorerService } from '../../src/main/services/files/FileExplorerService';

// Create a temp directory for each test
let tempDir: string;
let service: ReturnType<typeof createFileExplorerService>;

function setupTestDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-explorer-test-'));
  service = createFileExplorerService({
    getProjectFolder: (projectId: string) => (projectId === 'test-project' ? tempDir : null),
  });
}

function cleanupTestDir() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('FileExplorerService', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('path traversal protection', () => {

      }
    });

    it('allows valid relative paths', async () => {
      fs.mkdirSync(path.join(tempDir, 'valid-folder'));
      const result = await service.listDirectory('test-project', 'valid-folder');
      expect(result.ok).toBe(true);
    });
  });

  describe('listDirectory', () => {
    it('returns failure for unknown project', async () => {
      const result = await service.listDirectory('unknown-project');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Project not found');
      }
    });

    it('lists files and folders in directory', async () => {
      fs.mkdirSync(path.join(tempDir, 'folder1'));
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'content2');

      const result = await service.listDirectory('test-project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(3);
        expect(result.data.map((n) => n.name)).toContain('folder1');
        expect(result.data.map((n) => n.name)).toContain('file1.txt');
        expect(result.data.map((n) => n.name)).toContain('file2.txt');
      }
    });

    it('sorts directories first, then alphabetically', async () => {
      fs.mkdirSync(path.join(tempDir, 'zebra'));
      fs.mkdirSync(path.join(tempDir, 'alpha'));
      fs.writeFileSync(path.join(tempDir, 'aardvark.txt'), '');
      fs.writeFileSync(path.join(tempDir, 'zoo.txt'), '');

      const result = await service.listDirectory('test-project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const names = result.data.map((n) => n.name);
        // Directories first (alphabetically), then files (alphabetically)
        expect(names).toEqual(['alpha', 'zebra', 'aardvark.txt', 'zoo.txt']);
      }
    });

      fs.mkdirSync(path.join(tempDir, '.git'));
      fs.mkdirSync(path.join(tempDir, 'node_modules'));
      fs.writeFileSync(path.join(tempDir, '.DS_Store'), '');
      fs.writeFileSync(path.join(tempDir, 'visible.txt'), 'content');

      const result = await service.listDirectory('test-project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('visible.txt');
      }
    });

    it('returns correct file metadata', async () => {
      const content = 'test content';
      fs.writeFileSync(path.join(tempDir, 'test.txt'), content);

      const result = await service.listDirectory('test-project');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const file = result.data[0];
        expect(file.name).toBe('test.txt');
        expect(file.path).toBe('test.txt');
        expect(file.isDirectory).toBe(false);
        expect(file.isSymlink).toBe(false);
        expect(file.size).toBe(content.length);
        expect(file.modifiedAt).toBeDefined();
      }
    });

    it('returns empty array for non-existent directory', async () => {
      const result = await service.listDirectory('test-project', 'nonexistent');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual([]);
      }
    });

    it('supports recursive listing with depth limit', async () => {
      fs.mkdirSync(path.join(tempDir, 'level1', 'level2', 'level3'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'level1', 'file1.txt'), '');
      fs.writeFileSync(path.join(tempDir, 'level1', 'level2', 'file2.txt'), '');

      const result = await service.listDirectory('test-project', '', { recursive: true, depth: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const level1 = result.data.find((n) => n.name === 'level1');
        expect(level1?.children).toBeDefined();
        const level2 = level1?.children?.find((n) => n.name === 'level2');
        expect(level2?.children).toBeDefined();
        // level3 should not have children populated (depth limit)
        const level3 = level2?.children?.find((n) => n.name === 'level3');
        expect(level3?.children).toBeUndefined();
      }
    });
  });

  describe('createFolder', () => {
    it('creates a new folder', async () => {
      const result = await service.createFolder('test-project', 'new-folder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('new-folder');
        expect(result.data.isDirectory).toBe(true);
        expect(fs.existsSync(path.join(tempDir, 'new-folder'))).toBe(true);
      }
    });

    it('creates nested folders recursively', async () => {
      const result = await service.createFolder('test-project', 'parent/child/grandchild');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('grandchild');
        expect(fs.existsSync(path.join(tempDir, 'parent/child/grandchild'))).toBe(true);
      }
    });

    it('rejects if path already exists', async () => {
      fs.mkdirSync(path.join(tempDir, 'existing'));
      const result = await service.createFolder('test-project', 'existing');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path already exists');
      }
    });
  });

  describe('createFile', () => {
    it('creates a new file with content', async () => {
      const result = await service.createFile('test-project', 'test.txt', 'hello world');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test.txt');
        expect(result.data.isDirectory).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8')).toBe('hello world');
      }
    });

    it('creates parent directories if needed', async () => {
      const result = await service.createFile('test-project', 'nested/path/file.txt', 'content');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'nested/path/file.txt'))).toBe(true);
    });

    it('creates empty file when no content provided', async () => {
      const result = await service.createFile('test-project', 'empty.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.size).toBe(0);
      }
    });

    it('rejects if file already exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'existing.txt'), 'content');
      const result = await service.createFile('test-project', 'existing.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path already exists');
      }
    });
  });

  describe('deleteEntry', () => {
    it('deletes a file', async () => {
      fs.writeFileSync(path.join(tempDir, 'to-delete.txt'), 'content');
      const result = await service.deleteEntry('test-project', 'to-delete.txt');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'to-delete.txt'))).toBe(false);
    });

    it('deletes a folder recursively', async () => {
      fs.mkdirSync(path.join(tempDir, 'folder', 'subfolder'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'folder', 'file.txt'), 'content');
      const result = await service.deleteEntry('test-project', 'folder');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'folder'))).toBe(false);
    });

    it('prevents deleting project root', async () => {
      const result = await service.deleteEntry('test-project', '');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot delete project root');
      }
    });

    it.each(['AGENTS.md', 'CLAUDE.md'])('prevents deleting %s', async (filename) => {
      fs.writeFileSync(path.join(tempDir, filename), `# ${filename}`);
      const result = await service.deleteEntry('test-project', filename);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(`Cannot delete ${filename}`);
      }
    });

    it.each(['AGENTS.md', 'CLAUDE.md'])('prevents deleting %s in subdirectory', async (filename) => {
      fs.mkdirSync(path.join(tempDir, 'subdir'));
      fs.writeFileSync(path.join(tempDir, 'subdir', filename), `# ${filename}`);
      const result = await service.deleteEntry('test-project', `subdir/${filename}`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(`Cannot delete ${filename}`);
      }
    });

    it('returns failure for non-existent path', async () => {
      const result = await service.deleteEntry('test-project', 'nonexistent.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path does not exist');
      }
    });
  });

  describe('rename', () => {
    it('renames a file', async () => {
      fs.writeFileSync(path.join(tempDir, 'old.txt'), 'content');
      const result = await service.rename('test-project', 'old.txt', 'new.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('new.txt');
        expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, 'new.txt'))).toBe(true);
      }
    });

    it('moves a file to a different directory', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');
      fs.mkdirSync(path.join(tempDir, 'target'));
      const result = await service.rename('test-project', 'file.txt', 'target/file.txt');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'target', 'file.txt'))).toBe(true);
    });

    it('creates parent directories for destination if needed', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');
      const result = await service.rename('test-project', 'file.txt', 'new/nested/file.txt');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'new', 'nested', 'file.txt'))).toBe(true);
    });

    it('returns failure if source does not exist', async () => {
      const result = await service.rename('test-project', 'nonexistent.txt', 'new.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Source path does not exist');
      }
    });

    it('returns failure if destination already exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'source.txt'), 'content');
      fs.writeFileSync(path.join(tempDir, 'destination.txt'), 'existing');
      const result = await service.rename('test-project', 'source.txt', 'destination.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Destination path already exists');
      }
    });

    it('renames a folder when only the casing changes', async () => {
      fs.mkdirSync(path.join(tempDir, 'Archive'));
      fs.writeFileSync(path.join(tempDir, 'Archive', 'note.txt'), 'content');

      const result = await service.rename('test-project', 'Archive', 'archive');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('archive');
        expect(result.data.path).toBe('archive');
        expect(fs.existsSync(path.join(tempDir, 'archive'))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, 'archive', 'note.txt'))).toBe(true);
      }
    });
  });

  describe('readFile', () => {
    it('reads file content', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'file content');
      const result = await service.readFileAsync('test-project', 'test.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('file content');
      }
    });

    it('returns failure for non-existent file', async () => {
      const result = await service.readFileAsync('test-project', 'nonexistent.txt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('File does not exist');
      }
    });

    it('returns failure when trying to read a directory', async () => {
      fs.mkdirSync(path.join(tempDir, 'folder'));
      const result = await service.readFileAsync('test-project', 'folder');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot read directory as file');
      }
    });

  });

  describe('writeFile', () => {
    it('writes content to existing file', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'old content');
      const result = await service.writeFile('test-project', 'test.txt', 'new content');
      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8')).toBe('new content');
    });

    it('creates file if it does not exist', async () => {
      const result = await service.writeFile('test-project', 'new.txt', 'content');
      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf-8')).toBe('content');
    });

    it('creates parent directories if needed', async () => {
      const result = await service.writeFile('test-project', 'nested/path/file.txt', 'content');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'nested', 'path', 'file.txt'))).toBe(true);
    });
  });

  describe('getInfo', () => {
    it('returns file information', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');
      const result = await service.getInfo('test-project', 'test.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test.txt');
        expect(result.data.isDirectory).toBe(false);
        expect(result.data.size).toBe(7);
      }
    });

    it('returns directory information', async () => {
      fs.mkdirSync(path.join(tempDir, 'folder'));
      const result = await service.getInfo('test-project', 'folder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('folder');
        expect(result.data.isDirectory).toBe(true);
      }
    });

    it('returns failure for non-existent path', async () => {
      const result = await service.getInfo('test-project', 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path does not exist');
      }
    });
  });

  describe('getSymlinkInfo', () => {
    it('returns failure for non-existent path', async () => {
      const result = await service.getSymlinkInfo('test-project', 'missing-link');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path does not exist');
      }
    });

    it('returns non-symlink metadata for regular files', async () => {
      fs.writeFileSync(path.join(tempDir, 'regular.txt'), 'content');
      const result = await service.getSymlinkInfo('test-project', 'regular.txt');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ isSymlink: false });
      }
    });
  });
});
