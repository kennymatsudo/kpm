import { describe, it, expect } from 'vitest';
import {
  isAbsolutePathRef,
  isPathLike,
  isWorkspaceLinkHref,
  parsePathRef,
  relativeToRoot,
  workspaceLinkPath,
} from './pathRefs';

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

  it('matches absolute paths, with and without a line number', () => {
    expect(isPathLike('/Users/me/repo/src/foo.ts')).toBe(true);
    expect(isPathLike('/Users/me/repo/plan.md:1')).toBe(true);
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

  it('matches absolute link targets, which agents emit far more often than relative ones', () => {
    expect(isWorkspaceLinkHref('/Users/me/repo/docs/plan.md')).toBe(true);
    expect(isWorkspaceLinkHref('/Users/me/repo/docs/plan.md:1')).toBe(true);
  });

  it('matches link targets carrying a line number', () => {
    expect(isWorkspaceLinkHref('docs/spec.md:42')).toBe(true);
  });

  it('rejects protocol-relative and fragment-only targets', () => {
    expect(isWorkspaceLinkHref('//example.com/foo.md')).toBe(false);
    expect(isWorkspaceLinkHref('#heading')).toBe(false);
  });

  it('rejects traversal out of the workspace', () => {
    expect(isWorkspaceLinkHref('../../secrets.md')).toBe(false);
    expect(isWorkspaceLinkHref('docs/../spec.md')).toBe(false);
  });

  it('rejects targets without an extension', () => {
    expect(isWorkspaceLinkHref('docs/spec')).toBe(false);
    expect(isWorkspaceLinkHref('/etc/passwd')).toBe(false);
  });
});

describe('workspaceLinkPath', () => {
  it('strips the ./ prefix and the fragment', () => {
    expect(workspaceLinkPath('./docs/spec.md#context')).toBe('docs/spec.md');
    expect(workspaceLinkPath('docs/spec.md')).toBe('docs/spec.md');
  });

  it('strips the line number, which the editor cannot honor', () => {
    expect(workspaceLinkPath('/Users/me/repo/plan.md:1')).toBe('/Users/me/repo/plan.md');
    expect(workspaceLinkPath('docs/spec.md:42#context')).toBe('docs/spec.md');
  });
});

describe('relativeToRoot', () => {
  it('re-expresses a path under the root as relative', () => {
    expect(relativeToRoot('/Users/me/repo/docs/plan.md', '/Users/me/repo')).toBe('docs/plan.md');
  });

  it('tolerates a trailing slash on the root', () => {
    expect(relativeToRoot('/Users/me/repo/docs/plan.md', '/Users/me/repo/')).toBe('docs/plan.md');
  });

  it('returns null for a path outside the root', () => {
    expect(relativeToRoot('/Users/me/other/plan.md', '/Users/me/repo')).toBeNull();
    expect(relativeToRoot('/etc/passwd', '/Users/me/repo')).toBeNull();
  });

  it('does not treat a sibling root sharing a name prefix as containing the path', () => {
    expect(relativeToRoot('/Users/me/repo-other/plan.md', '/Users/me/repo')).toBeNull();
  });

  it('returns null for the root itself, which is a directory not a file', () => {
    expect(relativeToRoot('/Users/me/repo', '/Users/me/repo')).toBeNull();
  });
});

describe('isAbsolutePathRef', () => {
  it('recognizes an absolute filesystem path', () => {
    expect(isAbsolutePathRef('/Users/me/repo/src/foo.ts')).toBe(true);
  });

  it('rejects a workspace-relative path', () => {
    expect(isAbsolutePathRef('src/foo.ts')).toBe(false);
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
