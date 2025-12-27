import fs from 'fs';
import path from 'path';
import os from 'os';

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

      fs.mkdirSync(path.join(tempDir, 'valid-folder'));
      expect(result.ok).toBe(true);
    });
  });

  describe('listDirectory', () => {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Project not found');
      }
    });

      fs.mkdirSync(path.join(tempDir, 'folder1'));
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'content2');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(3);
        expect(result.data.map((n) => n.name)).toContain('folder1');
        expect(result.data.map((n) => n.name)).toContain('file1.txt');
        expect(result.data.map((n) => n.name)).toContain('file2.txt');
      }
    });

      fs.mkdirSync(path.join(tempDir, 'zebra'));
      fs.mkdirSync(path.join(tempDir, 'alpha'));
      fs.writeFileSync(path.join(tempDir, 'aardvark.txt'), '');
      fs.writeFileSync(path.join(tempDir, 'zoo.txt'), '');

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

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('visible.txt');
      }
    });

      const content = 'test content';
      fs.writeFileSync(path.join(tempDir, 'test.txt'), content);

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

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual([]);
      }
    });

      fs.mkdirSync(path.join(tempDir, 'level1', 'level2', 'level3'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'level1', 'file1.txt'), '');
      fs.writeFileSync(path.join(tempDir, 'level1', 'level2', 'file2.txt'), '');

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
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('new-folder');
        expect(result.data.isDirectory).toBe(true);
        expect(fs.existsSync(path.join(tempDir, 'new-folder'))).toBe(true);
      }
    });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('grandchild');
        expect(fs.existsSync(path.join(tempDir, 'parent/child/grandchild'))).toBe(true);
      }
    });

      fs.mkdirSync(path.join(tempDir, 'existing'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path already exists');
      }
    });
  });

  describe('createFile', () => {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test.txt');
        expect(result.data.isDirectory).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8')).toBe('hello world');
      }
    });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'nested/path/file.txt'))).toBe(true);
    });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.size).toBe(0);
      }
    });

      fs.writeFileSync(path.join(tempDir, 'existing.txt'), 'content');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path already exists');
      }
    });
  });

  describe('deleteEntry', () => {
      fs.writeFileSync(path.join(tempDir, 'to-delete.txt'), 'content');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'to-delete.txt'))).toBe(false);
    });

      fs.mkdirSync(path.join(tempDir, 'folder', 'subfolder'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'folder', 'file.txt'), 'content');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'folder'))).toBe(false);
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot delete project root');
      }
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
      }
    });

      fs.mkdirSync(path.join(tempDir, 'subdir'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
      }
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path does not exist');
      }
    });
  });

  describe('rename', () => {
      fs.writeFileSync(path.join(tempDir, 'old.txt'), 'content');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('new.txt');
        expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, 'new.txt'))).toBe(true);
      }
    });

      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');
      fs.mkdirSync(path.join(tempDir, 'target'));
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'target', 'file.txt'))).toBe(true);
    });

      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'new', 'nested', 'file.txt'))).toBe(true);
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Source path does not exist');
      }
    });

      fs.writeFileSync(path.join(tempDir, 'source.txt'), 'content');
      fs.writeFileSync(path.join(tempDir, 'destination.txt'), 'existing');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Destination path already exists');
      }
    });
  });

  describe('readFile', () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'file content');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('file content');
      }
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('File does not exist');
      }
    });

      fs.mkdirSync(path.join(tempDir, 'folder'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Cannot read directory as file');
      }
    });
  });

  describe('writeFile', () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'old content');
      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, 'test.txt'), 'utf-8')).toBe('new content');
    });

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf-8')).toBe('content');
    });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'nested', 'path', 'file.txt'))).toBe(true);
    });
  });

  describe('getInfo', () => {
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test.txt');
        expect(result.data.isDirectory).toBe(false);
        expect(result.data.size).toBe(7);
      }
    });

      fs.mkdirSync(path.join(tempDir, 'folder'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('folder');
        expect(result.data.isDirectory).toBe(true);
      }
    });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Path does not exist');
      }
    });
  });
});
