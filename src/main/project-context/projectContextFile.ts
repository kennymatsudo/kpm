import fs from 'fs';
import path from 'path';
import { CONTEXT_FILE_NAMES, DEFAULT_CONTEXT_FILENAME } from '../../shared/contextFile';

/**
 * Write the project's context file. Always targets AGENTS.md — a project that
 * still only has a legacy CLAUDE.md gets migrated to AGENTS.md the next time
 * its context is saved or regenerated. KPM no longer mirrors a CLAUDE.md copy:
 * Claude Code and Codex both read AGENTS.md natively now, so nothing depends
 * on a second file existing.
 */
export async function writeProjectContextFile(folderPath: string, content: string): Promise<void> {
  await fs.promises.writeFile(path.join(folderPath, DEFAULT_CONTEXT_FILENAME), content, 'utf-8');
}

export interface ProjectContextFileSyncFs {
  existsSync(path: string): boolean;
  writeFileSync(path: string, content: string, encoding?: BufferEncoding): void;
}

export function writeProjectContextFileSync(
  fsImpl: ProjectContextFileSyncFs,
  folderPath: string,
  content: string,
): void {
  fsImpl.writeFileSync(path.join(folderPath, DEFAULT_CONTEXT_FILENAME), content, 'utf-8');
}

/**
 * Initial-creation variant: leave any existing context file in place. Used when
 * registering a folder that may already ship its own AGENTS.md / CLAUDE.md
 * (e.g. a freshly cloned repo). For regeneration / save flows that should
 * replace content, call `writeProjectContextFileSync` directly instead.
 */
export function writeInitialProjectContextFileSync(
  fsImpl: ProjectContextFileSyncFs,
  folderPath: string,
  content: string,
): void {
  const alreadyExists = CONTEXT_FILE_NAMES.some((name) => fsImpl.existsSync(path.join(folderPath, name)));
  if (alreadyExists) return;
  writeProjectContextFileSync(fsImpl, folderPath, content);
}
