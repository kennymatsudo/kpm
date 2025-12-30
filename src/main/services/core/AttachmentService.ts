import type * as fs from 'fs/promises';
import type * as path from 'path';
import type { Attachment } from '../../../shared/types';
import type { IAttachmentRepository, IProjectRepository } from '../../db/interfaces';
import { failure, success, type ServiceResult, type AsyncResult } from '../result';

export interface AttachmentFs {
  access: typeof fs.access;
  mkdir: typeof fs.mkdir;
  copyFile: typeof fs.copyFile;
  unlink: typeof fs.unlink;
}

export interface AttachmentPath {
  join: typeof path.join;
  basename: typeof path.basename;
  extname: typeof path.extname;
}

export interface AttachmentServiceDeps {
  attachments: IAttachmentRepository;
  projects: IProjectRepository;
  fs: AttachmentFs;
  path: AttachmentPath;
}

async function fileExists(fsImpl: AttachmentFs, filePath: string): Promise<boolean> {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getUniqueFilename(fsImpl: AttachmentFs, pathImpl: AttachmentPath, dir: string, filename: string): Promise<string> {
  const ext = pathImpl.extname(filename);
  const base = pathImpl.basename(filename, ext);
  let candidate = filename;
  let counter = 1;

  while (await fileExists(fsImpl, pathImpl.join(dir, candidate))) {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }

  return candidate;
}

export function createAttachmentService(deps: AttachmentServiceDeps) {
  return {
    async add(projectId: string, sourcePath: string, filename: string): AsyncResult<Attachment> {
      const project = deps.projects.get(projectId);
      if (!project) {
        return failure('Project not found');
      }

      try {
        // Sanitize filename to prevent path traversal attacks (extra safety)
        const safeFilename = deps.path.basename(filename);

        // Create attachments directory if it doesn't exist
        const attachmentsDir = deps.path.join(project.folder_path, 'attachments');
        if (!(await fileExists(deps.fs, attachmentsDir))) {
          await deps.fs.mkdir(attachmentsDir, { recursive: true });
        }

        // Get unique filename to avoid overwrites
        const uniqueFilename = await getUniqueFilename(deps.fs, deps.path, attachmentsDir, safeFilename);
        const destPath = deps.path.join(attachmentsDir, uniqueFilename);

        // Copy file to project's attachments folder (non-blocking)
        await deps.fs.copyFile(sourcePath, destPath);

        // Store with the new path in the project folder
        return success(deps.attachments.add(projectId, destPath, uniqueFilename));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async remove(attachmentId: string): AsyncResult<void> {
      try {
        const attachment = deps.attachments.get(attachmentId);

        if (attachment && (await fileExists(deps.fs, attachment.path))) {
          await deps.fs.unlink(attachment.path);
        }

        deps.attachments.remove(attachmentId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    list(projectId: string): ServiceResult<Attachment[]> {
      try {
        return success(deps.attachments.getByProject(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type AttachmentService = ReturnType<typeof createAttachmentService>;
