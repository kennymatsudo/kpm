import fs from 'fs';
import type { FileMetadataRow, IProjectFileMetadataRepository } from '../../db/interfaces/files';
import { createFileSummaryService } from './FileSummaryService';

const runClaudeQueryMock = vi.hoisted(() => vi.fn());

vi.mock('../../claude/runClaudeQuery', () => ({
  runClaudeQuery: runClaudeQueryMock,
}));

vi.mock('../../claude/findClaude', () => ({
  getClaudeSdkSpawnOptions: () => undefined,
}));

class FakeProjectFileMetadataRepository implements IProjectFileMetadataRepository {
  rows = new Map<string, FileMetadataRow>();

  private key(projectId: string, path: string): string {
    return `${projectId}\0${path}`;
  }

  getByPath(projectId: string, path: string): FileMetadataRow | null {
    return this.rows.get(this.key(projectId, path)) ?? null;
  }

  getAllForProject(projectId: string): FileMetadataRow[] {
    return [...this.rows.values()].filter((row) => row.project_id === projectId);
  }

  upsertHash(projectId: string, path: string, hash: string): void {
    const existing = this.getByPath(projectId, path);
    this.rows.set(this.key(projectId, path), {
      project_id: projectId,
      path,
      content_hash: hash,
      summary: existing?.content_hash === hash ? existing.summary : null,
      summarized_at: existing?.content_hash === hash ? existing.summarized_at : null,
    });
  }

  setSummaryForHash(projectId: string, path: string, hash: string, summary: string): boolean {
    const existing = this.getByPath(projectId, path);
      return false;
    }

    existing.summary = summary;
    existing.summarized_at = new Date().toISOString();
    return true;
  }

  deleteByPath(projectId: string, path: string): void {
    this.rows.delete(this.key(projectId, path));
  }

  deleteByPathPrefix(projectId: string, prefix: string): void {
    for (const row of this.getAllForProject(projectId)) {
      if (row.path === prefix || row.path.startsWith(`${prefix}/`)) {
        this.rows.delete(this.key(projectId, row.path));
      }
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('FileSummaryService', () => {
  let repository: FakeProjectFileMetadataRepository;
  let service: ReturnType<typeof createFileSummaryService>;

  beforeEach(() => {
    repository = new FakeProjectFileMetadataRepository();
    service = createFileSummaryService({ repository });
    runClaudeQueryMock.mockReset();
  });

  it('only stores a generated summary when the content hash still matches', async () => {
    const first = deferred<{ text: string; errors: string[] }>();
    const second = deferred<{ text: string; errors: string[] }>();
    runClaudeQueryMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstRun = service.processFile('project-1', 'notes.md', 'first content');
    const secondRun = service.processFile('project-1', 'notes.md', 'second content');

    second.resolve({ text: 'Second summary', errors: [] });
    await secondRun;

    first.resolve({ text: 'Stale first summary', errors: [] });
    await firstRun;

    expect(repository.getByPath('project-1', 'notes.md')?.summary).toBe('Second summary');
  });

  it('clears metadata when a summarized text file becomes empty', async () => {
    repository.upsertHash('project-1', 'notes.md', 'old-hash');
    repository.setSummaryForHash('project-1', 'notes.md', 'old-hash', 'Old summary');

    await service.processFile('project-1', 'notes.md', '   ');

    expect(repository.getByPath('project-1', 'notes.md')).toBeNull();
    expect(runClaudeQueryMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent summary generation for the same file hash', async () => {
    const summary = deferred<{ text: string; errors: string[] }>();
    runClaudeQueryMock.mockReturnValueOnce(summary.promise);

    const firstRun = service.processFile('project-1', 'notes.md', 'same content');
    const secondRun = service.processFile('project-1', 'notes.md', 'same content');

    await secondRun;
    expect(runClaudeQueryMock).toHaveBeenCalledTimes(1);

    summary.resolve({ text: 'Shared summary', errors: [] });
    await firstRun;

    expect(repository.getByPath('project-1', 'notes.md')?.summary).toBe('Shared summary');
  });

  it('does not call Claude for non-summarizable files and removes stale metadata', async () => {
    repository.upsertHash('project-1', 'image.png', 'old-hash');
    repository.setSummaryForHash('project-1', 'image.png', 'old-hash', 'Old image summary');

    await service.processFile('project-1', 'image.png', 'png bytes');

    expect(repository.getByPath('project-1', 'image.png')).toBeNull();
    expect(runClaudeQueryMock).not.toHaveBeenCalled();
  });

  it('logs non-race read failures when processing from disk', async () => {
    const readSpy = vi
      .spyOn(fs.promises, 'readFile')
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    await service.processFileFromDisk('project-1', 'notes.md', '/tmp/notes.md');

    expect(debugSpy).toHaveBeenCalledWith(
      '[FileSummaryService] Failed to read file for summary:',
      expect.objectContaining({
        projectId: 'project-1',
        filePath: 'notes.md',
        fullPath: '/tmp/notes.md',
      })
    );
    expect(runClaudeQueryMock).not.toHaveBeenCalled();

    readSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
