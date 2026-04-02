import fs from 'fs';
import path from 'path';
import {
  COMPAT_CONTEXT_FILENAME,
  DEFAULT_CONTEXT_FILENAME,

const SYMLINK_TARGET = DEFAULT_CONTEXT_FILENAME;

function isMissingError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isSymlinkUnsupportedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP' || code === 'EINVAL';
}

async function ensureCompatPath(
  primaryPath: string,
  compatPath: string,
  content: string,
): Promise<void> {
  try {
    const stats = await fs.promises.lstat(compatPath);
    if (stats.isDirectory()) {
      throw new Error(`${COMPAT_CONTEXT_FILENAME} is a directory, expected a file or symlink`);
    }

    if (stats.isSymbolicLink()) {
      const currentTarget = await fs.promises.readlink(compatPath);
      const resolvedTarget = path.resolve(path.dirname(compatPath), currentTarget);
      if (resolvedTarget === primaryPath) {
        return;
      }
    }

    await fs.promises.unlink(compatPath);
  } catch (error) {
    if (!isMissingError(error)) {
      throw error;
    }
  }

  try {
    await fs.promises.symlink(SYMLINK_TARGET, compatPath);
  } catch (error) {
    if (!isSymlinkUnsupportedError(error)) {
      throw error;
    }
    await fs.promises.writeFile(compatPath, content, 'utf-8');
  }
}

export async function writeProjectContextFiles(folderPath: string, content: string): Promise<void> {
  const primaryPath = path.join(folderPath, DEFAULT_CONTEXT_FILENAME);
  const compatPath = path.join(folderPath, COMPAT_CONTEXT_FILENAME);

  await fs.promises.writeFile(primaryPath, content, 'utf-8');
  await ensureCompatPath(primaryPath, compatPath, content);
}

export interface ContextFileCompatSyncFs {
  existsSync(path: string): boolean;
  writeFileSync(path: string, content: string, encoding?: BufferEncoding): void;
  lstatSync?(path: string): fs.Stats;
  readlinkSync?(path: string): string;
  unlinkSync?(path: string): void;
  symlinkSync?(target: string, path: string): void;
}

function ensureCompatPathSync(
  fsImpl: ContextFileCompatSyncFs,
  primaryPath: string,
  compatPath: string,
  content: string,
): void {
  if (fsImpl.existsSync(compatPath)) {
    const stats = fsImpl.lstatSync?.(compatPath);
    if (stats?.isDirectory()) {
      throw new Error(`${COMPAT_CONTEXT_FILENAME} is a directory, expected a file or symlink`);
    }

    if (stats?.isSymbolicLink() && fsImpl.readlinkSync) {
      const currentTarget = fsImpl.readlinkSync(compatPath);
      const resolvedTarget = path.resolve(path.dirname(compatPath), currentTarget);
      if (resolvedTarget === primaryPath) {
        return;
      }
    }

    fsImpl.unlinkSync?.(compatPath);
  }

  if (fsImpl.symlinkSync) {
    try {
      fsImpl.symlinkSync(SYMLINK_TARGET, compatPath);
      return;
    } catch (error) {
      if (!isSymlinkUnsupportedError(error)) {
        throw error;
      }
    }
  }

  fsImpl.writeFileSync(compatPath, content, 'utf-8');
}

export function writeProjectContextFilesSync(
  fsImpl: ContextFileCompatSyncFs,
  folderPath: string,
  content: string,
): void {
  const primaryPath = path.join(folderPath, DEFAULT_CONTEXT_FILENAME);
  const compatPath = path.join(folderPath, COMPAT_CONTEXT_FILENAME);

  fsImpl.writeFileSync(primaryPath, content, 'utf-8');
  ensureCompatPathSync(fsImpl, primaryPath, compatPath, content);
}
