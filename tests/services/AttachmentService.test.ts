import { describe, it, expect, vi } from 'vitest';
import { createAttachmentService, type AttachmentServiceDeps } from '../../src/main/services/core/AttachmentService';
import type { Attachment, Project } from '../../src/shared/types';

function createProject(id: string): Project {
  return {
    id,
    name: 'Test Project',
    folder_path: '/tmp/test-project',
    phase: 'discovery',
    session_tokens: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
    storybook_url: null,
    created_at: '',
    updated_at: '',
  };
}

function createAttachment(id: string, projectId: string): Attachment {
  return {
    id,
    project_id: projectId,
    path: '/tmp/test-project/attachments/file.png',
    filename: 'file.png',
    created_at: '',
  };
}

function createMocks(overrides?: Partial<AttachmentServiceDeps>): AttachmentServiceDeps {
  const projectStore = new Map<string, Project>([['p1', createProject('p1')]]);
  const attachmentStore = new Map<string, Attachment>();

  const attachments = {
    getByProject: vi.fn((projectId: string) =>
      Array.from(attachmentStore.values()).filter(a => a.project_id === projectId)
    ),
    add: vi.fn((projectId: string, destPath: string, filename: string) => {
      const attachment: Attachment = {
        id: 'new-attachment',
        project_id: projectId,
        path: destPath,
        filename,
        created_at: new Date().toISOString(),
      };
      attachmentStore.set(attachment.id, attachment);
      return attachment;
    }),
    get: vi.fn((id: string) => attachmentStore.get(id)),
    delete: vi.fn((id: string) => attachmentStore.delete(id)),
    remove: vi.fn((id: string) => attachmentStore.delete(id)),
  };

  const projects = {
    create: vi.fn(),
    get: vi.fn((id: string) => projectStore.get(id)),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStorybookUrl: vi.fn(),
    updateContextDirectories: vi.fn(),
    getContextDirectories: vi.fn(() => null),
    updateSession: vi.fn(),
    updateTokens: vi.fn(),
    resetTokens: vi.fn(),
  };

  const existingFiles = new Set<string>();

  // Use type assertion because we only need a subset of fs methods
  const fs = {
    access: vi.fn((filePath: unknown) => {
      if (!existingFiles.has(filePath as string)) {
        return Promise.reject(new Error('ENOENT'));
      }
      return Promise.resolve();
    }),
    mkdir: vi.fn(() => Promise.resolve(undefined)),
    copyFile: vi.fn(() => Promise.resolve(undefined)),
    unlink: vi.fn(() => Promise.resolve(undefined)),
    readFile: vi.fn(() => Promise.resolve(Buffer.from('file contents'))),
  } as unknown as AttachmentServiceDeps['fs'];

  const path = {
    join: vi.fn((...paths: string[]) => paths.join('/')),
    basename: vi.fn((p: string) => p.split('/').pop() || p),
    extname: vi.fn((p: string) => {
      const match = /\.[^.]+$/.exec(p);
      return match ? match[0] : '';
    }),
  } as unknown as AttachmentServiceDeps['path'];

  const classifyAttachment = vi.fn((filename: string) => {
    if (filename.endsWith('.png')) {
      return { kind: 'image' as const, mediaType: 'image/png' };
    }
    return null;
  });

  const saveTempAttachment = vi.fn((_data: Buffer, filename: string, mediaType?: string) =>
    Promise.resolve({
      success: true as const,
      path: `/tmp/kpm-attachments/${filename}`,
      filename,
      kind: 'image' as const,
      mediaType: mediaType ?? 'image/png',
    })
  );

  return { attachments, projects, fs, path, classifyAttachment, saveTempAttachment, ...overrides };
}

describe('AttachmentService', () => {
  describe('add', () => {
    it('copies file to project attachments folder and creates record', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      const result = await service.add('p1', '/source/image.png', 'image.png');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.filename).toBe('image.png');
        expect(result.data.project_id).toBe('p1');
      }
      expect(deps.fs.mkdir).toHaveBeenCalled();
      expect(deps.fs.copyFile).toHaveBeenCalledWith(
        '/source/image.png',
        '/tmp/test-project/attachments/image.png'
      );
      expect(deps.attachments.add).toHaveBeenCalled();
    });

    it('returns failure when project not found', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      const result = await service.add('nonexistent', '/source/file.png', 'file.png');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Project not found');
      }
    });

    it('sanitizes filename to prevent path traversal', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      await service.add('p1', '/source/file.png', '../../../etc/passwd');

      expect(deps.attachments.add).toHaveBeenCalledWith(
        'p1',
        expect.any(String),
        'passwd',
      );
    });

    it('returns failure when file copy fails', async () => {
      const baseDeps = createMocks();
      const deps: AttachmentServiceDeps = {
        ...baseDeps,
        fs: {
          access: vi.fn(async () => { throw new Error('ENOENT'); }),
          mkdir: vi.fn(async () => undefined),
          copyFile: vi.fn(async () => { throw new Error('Permission denied'); }),
          unlink: vi.fn(async () => undefined),
          readFile: vi.fn(async () => Buffer.from('')),
        } as unknown as AttachmentServiceDeps['fs'],
      };
      const service = createAttachmentService(deps);

      const result = await service.add('p1', '/source/file.png', 'file.png');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Permission denied');
      }
    });
  });

  describe('remove', () => {
    it('deletes file and removes record', async () => {
      const attachment = createAttachment('a1', 'p1');
      const deps = createMocks();
      (deps.attachments.get as ReturnType<typeof vi.fn>).mockReturnValue(attachment);
      // Mark file as existing
      (deps.fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const service = createAttachmentService(deps);

      const result = await service.remove('a1');

      expect(result.ok).toBe(true);
      expect(deps.fs.unlink).toHaveBeenCalledWith(attachment.path);
      expect(deps.attachments.remove).toHaveBeenCalledWith('a1');
    });

    it('removes record even when file does not exist', async () => {
      const attachment = createAttachment('a1', 'p1');
      const deps = createMocks();
      (deps.attachments.get as ReturnType<typeof vi.fn>).mockReturnValue(attachment);
      // File does not exist
      (deps.fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const service = createAttachmentService(deps);

      const result = await service.remove('a1');

      expect(result.ok).toBe(true);
      expect(deps.fs.unlink).not.toHaveBeenCalled();
      expect(deps.attachments.remove).toHaveBeenCalledWith('a1');
    });
  });

  describe('pickForChat', () => {
    it('reads and saves each classified file, returning picked metadata', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      const result = await service.pickForChat(['/source/image.png']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.picked).toEqual([
          { path: '/tmp/kpm-attachments/image.png', filename: 'image.png', kind: 'image', mediaType: 'image/png' },
        ]);
        expect(result.data.errors).toEqual([]);
      }
      expect(deps.fs.readFile).toHaveBeenCalledWith('/source/image.png');
      expect(deps.saveTempAttachment).toHaveBeenCalledWith(expect.any(Buffer), 'image.png', 'image/png');
    });

    it('collects an error for unsupported file types without reading the file', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      const result = await service.pickForChat(['/source/file.exe']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.picked).toEqual([]);
        expect(result.data.errors).toEqual([
          {
            filename: 'file.exe',
            error: 'Unsupported file type. Allowed: images (PNG/JPEG/GIF/WebP), PDF, text/markdown/JSON/YAML.',
          },
        ]);
      }
      expect(deps.fs.readFile).not.toHaveBeenCalled();
    });

    it('collects an error when reading the file fails', async () => {
      const deps = createMocks({
        fs: {
          ...createMocks().fs,
          readFile: vi.fn(() => Promise.reject(new Error('EACCES'))),
        },
      });
      const service = createAttachmentService(deps);

      const result = await service.pickForChat(['/source/image.png']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.picked).toEqual([]);
        expect(result.data.errors).toEqual([{ filename: 'image.png', error: 'EACCES' }]);
      }
    });

    it('collects an error when saving the temp attachment fails', async () => {
      const deps = createMocks({
        saveTempAttachment: vi.fn(() => Promise.resolve({ success: false as const, error: 'Disk full' })),
      });
      const service = createAttachmentService(deps);

      const result = await service.pickForChat(['/source/image.png']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.picked).toEqual([]);
        expect(result.data.errors).toEqual([{ filename: 'image.png', error: 'Disk full' }]);
      }
    });

    it('processes multiple files independently, mixing successes and errors', async () => {
      const deps = createMocks();
      const service = createAttachmentService(deps);

      const result = await service.pickForChat(['/source/image.png', '/source/file.exe']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.picked).toHaveLength(1);
        expect(result.data.errors).toHaveLength(1);
        expect(result.data.errors[0]?.filename).toBe('file.exe');
      }
    });
  });

});
