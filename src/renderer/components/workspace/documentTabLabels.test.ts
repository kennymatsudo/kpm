import { describe, it, expect } from 'vitest';
import { buildTabLabels } from './documentTabLabels';

function labelsFor(paths: string[]): string[] {
  const documents = paths.map((path) => ({ id: `project:${path}`, path }));
  const labels = buildTabLabels(documents);
  return documents.map((document) => labels.get(document.id) ?? '');
}

describe('buildTabLabels', () => {
  it('uses the file name when nothing collides', () => {
    expect(labelsFor(['notes/spec.md', 'README.md'])).toEqual(['spec.md', 'README.md']);
  });

  it('adds the parent folder only to the names that collide', () => {
    expect(labelsFor(['api/index.ts', 'web/index.ts', 'README.md'])).toEqual([
      'api/index.ts',
      'web/index.ts',
      'README.md',
    ]);
  });

  it('keeps growing the path until the labels differ', () => {
    expect(labelsFor(['a/src/index.ts', 'b/src/index.ts'])).toEqual([
      'a/src/index.ts',
      'b/src/index.ts',
    ]);
  });

  it('handles a collision with a file at the root', () => {
    expect(labelsFor(['spec.md', 'notes/spec.md'])).toEqual(['spec.md', 'notes/spec.md']);
  });

  it('lets the same path from two sources share a label', () => {
    const documents = [
      { id: 'project:spec.md', path: 'spec.md' },
      { id: 'repo-1:spec.md', path: 'spec.md' },
    ];
    const labels = buildTabLabels(documents);
    expect(labels.get('project:spec.md')).toBe('spec.md');
    expect(labels.get('repo-1:spec.md')).toBe('spec.md');
  });

  it('returns nothing for an empty strip', () => {
    expect(buildTabLabels([]).size).toBe(0);
  });
});
