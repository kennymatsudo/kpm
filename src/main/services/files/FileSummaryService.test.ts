import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    if (existing?.content_hash !== hash) {
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('debounces disk summaries for rapid external edits', async () => {
    vi.useFakeTimers();
    const readSpy = vi.spyOn(fs.promises, 'readFile').mockResolvedValue('latest content');
    runClaudeQueryMock.mockResolvedValue({ text: 'Latest summary', errors: [] });

    expect(service.enqueueFileFromDisk('project-1', 'notes.md', '/tmp/notes.md', 1000)).toBe(true);
    expect(service.enqueueFileFromDisk('project-1', 'notes.md', '/tmp/notes.md', 1000)).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(readSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(runClaudeQueryMock).toHaveBeenCalledTimes(1));

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(repository.getByPath('project-1', 'notes.md')?.summary).toBe('Latest summary');

    readSpy.mockRestore();
  });

  it('reruns disk summary when a debounced edit lands during active processing', async () => {
    vi.useFakeTimers();
    const firstSummary = deferred<{ text: string; errors: string[] }>();
    const readSpy = vi
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValueOnce('first content')
      .mockResolvedValueOnce('second content');
    runClaudeQueryMock
      .mockReturnValueOnce(firstSummary.promise)
      .mockResolvedValueOnce({ text: 'Second summary', errors: [] });

    expect(service.enqueueFileFromDisk('project-1', 'notes.md', '/tmp/notes.md')).toBe(true);
    await vi.waitFor(() => expect(runClaudeQueryMock).toHaveBeenCalledTimes(1));

    expect(service.enqueueFileFromDisk('project-1', 'notes.md', '/tmp/notes.md', 1000)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runClaudeQueryMock).toHaveBeenCalledTimes(1);

    firstSummary.resolve({ text: 'First summary', errors: [] });
    await vi.waitFor(() => expect(runClaudeQueryMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(repository.getByPath('project-1', 'notes.md')?.summary).toBe('Second summary'));

    expect(readSpy).toHaveBeenCalledTimes(2);
    readSpy.mockRestore();
  });
});
