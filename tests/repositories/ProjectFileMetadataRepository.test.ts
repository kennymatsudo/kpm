import { beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositoryContext, type TestRepositoryContext } from '../';

describe('ProjectFileMetadataRepository', () => {
  let ctx: TestRepositoryContext;
  let projectId: string;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
  });

  it('clears the summary when the stored content hash changes', () => {
    ctx.repos.projectFileMetadata.upsertHash(projectId, 'notes.md', 'hash-1');
    ctx.repos.projectFileMetadata.setSummaryForHash(projectId, 'notes.md', 'hash-1', 'Old summary');

    ctx.repos.projectFileMetadata.upsertHash(projectId, 'notes.md', 'hash-2');

    const row = ctx.repos.projectFileMetadata.getByPath(projectId, 'notes.md');
    expect(row?.content_hash).toBe('hash-2');
    expect(row?.summary).toBeNull();
    expect(row?.summarized_at).toBeNull();
  });

  it('only stores a summary when the expected content hash matches', () => {
    ctx.repos.projectFileMetadata.upsertHash(projectId, 'notes.md', 'hash-1');

    expect(
      ctx.repos.projectFileMetadata.setSummaryForHash(
        projectId,
        'notes.md',
        'stale-hash',
        'Stale summary'
      )
    ).toBe(false);
    expect(ctx.repos.projectFileMetadata.getByPath(projectId, 'notes.md')?.summary).toBeNull();

    expect(
      ctx.repos.projectFileMetadata.setSummaryForHash(
        projectId,
        'notes.md',
        'hash-1',
        'Fresh summary'
      )
    ).toBe(true);
    expect(ctx.repos.projectFileMetadata.getByPath(projectId, 'notes.md')?.summary).toBe('Fresh summary');
  });
});
