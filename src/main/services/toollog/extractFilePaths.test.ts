import { describe, it, expect } from 'vitest';
import { extractFilePaths } from './extractFilePaths';

describe('extractFilePaths', () => {
  it('extracts file_path from Read tool', () => {
    expect(extractFilePaths('Read', { file_path: '/foo/bar.ts' })).toEqual(['/foo/bar.ts']);
  });

  it('extracts file_path from Edit tool', () => {
    expect(extractFilePaths('Edit', { file_path: '/src/index.ts', old_string: 'a', new_string: 'b' })).toEqual(['/src/index.ts']);
  });

  it('extracts file_path from Write tool', () => {
    expect(extractFilePaths('Write', { file_path: '/out/file.json', content: '{}' })).toEqual(['/out/file.json']);
  });

  it('extracts path from Grep tool', () => {
    expect(extractFilePaths('Grep', { pattern: 'foo', path: '/src' })).toEqual(['/src']);
  });

  it('extracts path from Glob tool', () => {
    expect(extractFilePaths('Glob', { pattern: '**/*.ts', path: '/project' })).toEqual(['/project']);
  });

  it('returns empty for Grep without path', () => {
    expect(extractFilePaths('Grep', { pattern: 'foo' })).toEqual([]);
  });

  it('returns empty for Bash tool', () => {
    expect(extractFilePaths('Bash', { command: 'ls -la' })).toEqual([]);
  });

  it('returns empty for MCP tools', () => {
    expect(extractFilePaths('mcp__kpm__list_items', { projectId: '123' })).toEqual([]);
  });

  it('returns empty when file_path is not a string', () => {
    expect(extractFilePaths('Read', { file_path: 42 })).toEqual([]);
  });

  it('returns empty for unknown tools', () => {
    expect(extractFilePaths('UnknownTool', { foo: 'bar' })).toEqual([]);
  });
});
