import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONTEXT_FILENAME } from '../../src/shared/contextFile';
import { createTestRepositoryContext, type TestRepositoryContext } from '../';

describe('ProjectRepository', () => {
  let ctx: TestRepositoryContext;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
  });

  it('creates the default context file when a project is created', () => {
    const project = ctx.repos.projects.create({ name: 'Test Project' });
    const contextFilePath = `${project.folder_path}/${DEFAULT_CONTEXT_FILENAME}`;
    const compatFilePath = `${project.folder_path}/CLAUDE.md`;

    expect(ctx.mockFs.writtenFiles.has(contextFilePath)).toBe(true);
    expect(ctx.mockFs.writtenFiles.get(contextFilePath)).toContain('# Test Project');
    expect(ctx.mockFs.symlinkedFiles.get(compatFilePath)).toBe(DEFAULT_CONTEXT_FILENAME);
  });
});
