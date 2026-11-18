import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileDiff } from '../../../shared/diffReview';

vi.mock('../../stores/diffReviewStore', () => {
  const state = {
    commentsBySession: {},
    editComment: vi.fn().mockResolvedValue(true),
    removeComment: vi.fn(),
    addComment: vi.fn(),
  };
  const useDiffReviewStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state,
  });
  return { useDiffReviewStore };
});

import { DiffReviewView } from './DiffReviewView';

const ctx = (n: number) => ({
  kind: 'context' as const,
  oldLine: n,
  newLine: n,
  text: `l${n}`,
});
const base: FileDiff = {
  rootPath: '/r',
  path: 'a.ts',
  status: 'modified',
  additions: 1,
  deletions: 0,
  binary: false,
  hunks: [],
};

describe('DiffReviewView', () => {
  it('renders the added marker and a collapsed gap bar', () => {
    const file: FileDiff = {
      ...base,
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            ...Array.from({ length: 10 }, (_, i) => ctx(i + 1)),
            { kind: 'add', oldLine: null, newLine: 11, text: 'added line' },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<DiffReviewView file={file} projectId="p" chatSessionId="s" expandAll={false} />);
    expect(html).toContain('bg-success-muted');
    expect(html).toContain('>+<');
    expect(html).toContain('7 unmodified lines');
  });

  it('renders a binary placeholder', () => {
    const html = renderToStaticMarkup(
      <DiffReviewView file={{ ...base, binary: true }} projectId="p" chatSessionId="s" expandAll={false} />,
    );
    expect(html).toContain('Binary file not shown.');
  });

  it('asks for a chat when there is no session', () => {
    const html = renderToStaticMarkup(
      <DiffReviewView file={base} projectId="p" chatSessionId={null} expandAll={false} />,
    );
    expect(html).toContain('Open a chat to comment.');
  });
});
