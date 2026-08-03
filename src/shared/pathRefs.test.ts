import { describe, it, expect } from 'vitest';
import { isPathLike, isWorkspaceLinkHref, parsePathRef, workspaceLinkPath } from './pathRefs';

describe('isPathLike', () => {
  it('matches relative paths with extensions', () => {
    expect(isPathLike('src/main/foo.ts')).toBe(true);
    expect(isPathLike('research/composer-architecture.md')).toBe(true);
    expect(isPathLike('a/b/c/d.py')).toBe(true);
  });

  it('matches paths with line number suffix', () => {
    expect(isPathLike('src/main/foo.ts:42')).toBe(true);
    expect(isPathLike('orchestrator_agent.py:210')).toBe(false); // no slash
    expect(isPathLike('a/orchestrator_agent.py:210')).toBe(true);
  });

  it('rejects URLs', () => {
    expect(isPathLike('https://example.com/foo.html')).toBe(false);
    expect(isPathLike('http://example.com/foo.html')).toBe(false);
  });

  it('rejects single-segment names without a slash', () => {
    expect(isPathLike('foo.md')).toBe(false);
    expect(isPathLike('package.json')).toBe(false);
  });

  it('rejects identifiers without extensions', () => {
    expect(isPathLike('a/b/c')).toBe(false);
    expect(isPathLike('Array.prototype.map')).toBe(false);
  });

  it('rejects expressions with parens or spaces', () => {
    expect(isPathLike('console.log()')).toBe(false);
    expect(isPathLike('foo/bar baz.ts')).toBe(false);
    expect(isPathLike('foo/bar.method()')).toBe(false);
  });
});

describe('isWorkspaceLinkHref', () => {
  it('matches project-relative link targets', () => {
    expect(isWorkspaceLinkHref('docs/spec.md')).toBe(true);
    expect(isWorkspaceLinkHref('./notes.md')).toBe(true);
    expect(isWorkspaceLinkHref('docs/adr/0001-seams.md#context')).toBe(true);
  });

  it('matches root-level documents, unlike the inline-code detector', () => {
    expect(isWorkspaceLinkHref('spec.md')).toBe(true);
    expect(isPathLike('spec.md')).toBe(false);
  });

  it('rejects targets with a scheme', () => {
    expect(isWorkspaceLinkHref('https://example.com/foo.html')).toBe(false);
    expect(isWorkspaceLinkHref('mailto:someone@example.com')).toBe(false);
    expect(isWorkspaceLinkHref('kpm-plan:8f3a')).toBe(false);
  });

  it('rejects absolute, protocol-relative, and fragment-only targets', () => {
    expect(isWorkspaceLinkHref('/etc/passwd')).toBe(false);
    expect(isWorkspaceLinkHref('//example.com/foo.md')).toBe(false);
    expect(isWorkspaceLinkHref('#heading')).toBe(false);
  });

  it('rejects traversal out of the workspace', () => {
    expect(isWorkspaceLinkHref('../../secrets.md')).toBe(false);
    expect(isWorkspaceLinkHref('docs/../spec.md')).toBe(false);
  });

  it('rejects targets without an extension', () => {
    expect(isWorkspaceLinkHref('docs/spec')).toBe(false);
  });
});

describe('workspaceLinkPath', () => {
  it('strips the ./ prefix and the fragment', () => {
    expect(workspaceLinkPath('./docs/spec.md#context')).toBe('docs/spec.md');
    expect(workspaceLinkPath('docs/spec.md')).toBe('docs/spec.md');
  });
});

describe('parsePathRef', () => {
  it('splits path and line number', () => {
    expect(parsePathRef('src/foo.ts:42')).toEqual({ path: 'src/foo.ts', line: 42 });
  });

  it('returns null line for paths without line suffix', () => {
    expect(parsePathRef('src/foo.ts')).toEqual({ path: 'src/foo.ts', line: null });
  });
});
