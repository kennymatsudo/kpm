import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileDiff } from '../../../shared/diffReview';

const mockState = vi.hoisted(() => ({
  changesTab: { chatSessionId: 's1', clientMessageId: 'm1', scope: 'turn' },
  commentsBySession: {},
}));
vi.mock('../../stores/diffReviewStore', () => ({
  useDiffReviewStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));
vi.mock('../../services/diffReviewService', () => ({ getDiff: vi.fn() }));

import { ChangesFileSection } from './ChangesFileSection';
import { ChangesFileTree } from './ChangesFileTree';
import { ChangesHeader, ChangesView } from './ChangesView';
import { buildChangesTree } from './changesTree';

const file = (path: string, additions = 1, deletions = 0): FileDiff => ({
  rootPath: '/r/proj',
  path,
  status: 'modified',
  additions,
  deletions,
  binary: false,
  hunks: [],
});

describe('ChangesView', () => {
  it('shows a loading state before the diff arrives', () => {
    expect(renderToStaticMarkup(<ChangesView projectId="p1" />)).toContain('Loading changes');
  });
});

describe('ChangesHeader', () => {
  const render = (props: Partial<Parameters<typeof ChangesHeader>[0]> = {}) =>
    renderToStaticMarkup(
      <ChangesHeader
        scope="turn"
        canSelectTurn
        onScope={() => {}}
        files={3}
        additions={12}
        deletions={4}
        commentCount={1}
        {...props}
      />,
    );

  it('shows totals and the comment count', () => {
    const html = render();
    expect(html).toContain('3 files changed');
    expect(html).toContain('+12');
    expect(html).toContain('-4');
    expect(html).toContain('1 comment');
    expect(html).not.toContain('1 comments');
  });

  it('uses the singular for one file', () => {
    expect(render({ files: 1 })).toContain('1 file changed');
  });
});

describe('ChangesFileTree', () => {
  it('lists files by root and directory with comment counts', () => {
    const roots = buildChangesTree([file('src/a.ts'), file('b.ts')], new Map([['/r/proj:src/a.ts', 3]]));
    const html = renderToStaticMarkup(<ChangesFileTree roots={roots} onSelect={() => {}} />);
    expect(html).toContain('proj');
    expect(html).toContain('src');
    expect(html).toContain('a.ts');
    expect(html).toContain('b.ts');
    expect(html).toContain('>3<');
  });
});

describe('ChangesFileSection', () => {
  const render = (f: FileDiff) =>
    renderToStaticMarkup(<ChangesFileSection file={f} projectId="p1" chatSessionId="s1" register={() => {}} />);

  it('has a sticky header with the path, counts, and Viewed', () => {
    const html = render(file('src/a.ts', 2, 1));
    expect(html).toMatch(/<header class="sticky top-0 z-10 [^"]*bg-surface-1/);
    expect(html).toContain('src/a.ts');
    expect(html).toContain('+2');
    expect(html).toContain('Viewed');
    expect(html).toContain('Full file');
  });

  it('starts a file over 400 changed lines collapsed with Load diff', () => {
    const html = render(file('big.ts', 300, 101));
    expect(html).toContain('Load diff');
  });

  it('does not offer Load diff at 400 changed lines', () => {
    expect(render(file('edge.ts', 300, 100))).not.toContain('Load diff');
  });
});
