import { describe, it, expect } from 'vitest';
import { buildFocusedSection, renderFocusedBlocks } from './focusedResources';
import type { FocusedResource } from '../../../shared/types';

// ---------------------------------------------------------------------------
// renderFocusedBlocks — type annotation and unresolved-resource tests
// ---------------------------------------------------------------------------

describe('renderFocusedBlocks', () => {
  it('annotates a project_file resource with "File:" prefix', () => {
    const resources: FocusedResource[] = [
      { type: 'project_file', path: 'src/components/Button.tsx', isDirectory: false },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).toBe('- File: src/components/Button.tsx');
  });

  it('annotates a directory resource with "Directory:" prefix', () => {
    const resources: FocusedResource[] = [
      { type: 'project_file', path: 'src/components', isDirectory: true },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).toBe('- Directory: src/components');
  });

  it('annotates a repo resource with "Repo:" prefix when path is present', () => {
    const resources: FocusedResource[] = [
      { type: 'repo', id: 'repo-uuid-1', path: '/home/user/projects/myrepo' },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).toBe('- Repo: /home/user/projects/myrepo');
  });

  it('flags a repo resource as unresolved when no path is available', () => {
    const resources: FocusedResource[] = [
      { type: 'repo', id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).toContain('Repo:');
    expect(blocks[0]).toContain('unresolved');
    expect(blocks[0]).toContain('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    // Must NOT just be a bare UUID with no type label
    expect(blocks[0]).not.toBe('- aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('annotates a document resource with "Document:" prefix and includes both title and path', () => {
    const resources: FocusedResource[] = [
      { type: 'document', id: 'doc-uuid-1', title: 'Architecture Overview', path: 'docs/arch.md' },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).toContain('Document:');
    expect(blocks[0]).toContain('Architecture Overview');
    expect(blocks[0]).toContain('docs/arch.md');
  });

  it('renders all resource types with annotations in a mixed list', () => {
    const resources: FocusedResource[] = [
      { type: 'project_file', path: 'src/index.ts', isDirectory: false },
      { type: 'repo', id: 'bare-uuid-repo' },
      { type: 'document', id: 'doc-1', title: 'Spec', path: 'docs/spec.md' },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe('- File: src/index.ts');
    expect(blocks[1]).toContain('Repo:');
    expect(blocks[1]).toContain('unresolved');
    expect(blocks[2]).toContain('Document:');
  });

  it('does not produce a bare UUID line for any resource', () => {
    const bareUuid = 'ffffffff-0000-4000-8000-000000000000';
    const resources: FocusedResource[] = [
      { type: 'repo', id: bareUuid },
    ];
    const { blocks } = renderFocusedBlocks(resources);
    expect(blocks[0]).not.toBe(`- ${bareUuid}`);
  });
});

// ---------------------------------------------------------------------------
// buildFocusedSection — integration: type labels appear in context block
// ---------------------------------------------------------------------------

describe('buildFocusedSection', () => {
  it('includes type-annotated lines for file and repo resources', () => {
    const resources: FocusedResource[] = [
      { type: 'project_file', path: 'lib/utils.ts', isDirectory: false },
      { type: 'repo', id: 'repo-uuid', path: '/repos/myproject' },
    ];
    const section = buildFocusedSection(resources);
    expect(section).toContain('File: lib/utils.ts');
    expect(section).toContain('Repo: /repos/myproject');
  });

  it('flags an unresolved repo in the section output', () => {
    const resources: FocusedResource[] = [
      { type: 'repo', id: 'cccccccc-dddd-4eee-9fff-aaaaaaaaaaaa' },
    ];
    const section = buildFocusedSection(resources);
    expect(section).toContain('unresolved');
    expect(section).toContain('cccccccc-dddd-4eee-9fff-aaaaaaaaaaaa');
  });

  it('returns empty string when no resources are provided', () => {
    expect(buildFocusedSection([])).toBe('');
  });

  it('is consistent for a single resource', () => {
    const single: FocusedResource[] = [
      { type: 'project_file', path: 'src/App.tsx', isDirectory: false },
    ];
    const section = buildFocusedSection(single);
    expect(section).toContain('File: src/App.tsx');
  });

  it('is consistent for multiple resources', () => {
    const many: FocusedResource[] = [
      { type: 'project_file', path: 'src/App.tsx', isDirectory: false },
      { type: 'document', id: 'd1', title: 'Guide', path: 'docs/guide.md' },
    ];
    const section = buildFocusedSection(many);
    expect(section).toContain('File: src/App.tsx');
    expect(section).toContain('Document:');
    expect(section).toContain('docs/guide.md');
  });
});
