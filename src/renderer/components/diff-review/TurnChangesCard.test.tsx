import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TurnChanges } from '../../../shared/diffReview';

// Server rendering reads a zustand store's initial state, so the test supplies the state directly.
const mockState = vi.hoisted(() => ({ turnChangesBySession: {} }));
vi.mock('../../stores/diffReviewStore', () => ({
  useDiffReviewStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

import { TurnChangesCard } from './TurnChangesCard';

function seed(turn: Partial<TurnChanges>) {
  const full: TurnChanges = {
    chatSessionId: 's1',
    clientMessageId: 'm1',
    createdAt: '2026-01-01T00:00:00Z',
    files: [],
    ...turn,
  };
  mockState.turnChangesBySession = { s1: [full] };
}

const render = () =>
  renderToStaticMarkup(
    <TurnChangesCard chatSessionId="s1" clientMessageId="m1" onOpen={() => {}} />
  );

describe('TurnChangesCard', () => {
  beforeEach(() => {
    mockState.turnChangesBySession = {};
  });

  it('renders nothing without changes', () => {
    seed({});
    expect(render()).toBe('');
  });

  it('renders totals, rows and the button', () => {
    seed({
      files: [
        { rootPath: '/r', path: 'src/a/foo.ts', status: 'modified', additions: 150, deletions: 10 },
        { rootPath: '/r', path: 'bar.ts', status: 'modified', additions: 11, deletions: 20 },
      ],
    });
    const html = render();
    expect(html).toContain('Edited 2 files');
    expect(html).toMatch(/text-success[^>]*>\+161</);
    expect(html).toMatch(/text-danger[^>]*>-30</);
    expect(html).toMatch(/text-text-muted[^>]*><bdi>src\/a\/</);
    expect(html).toMatch(/text-text-primary[^>]*>foo\.ts</);
    expect(html).toMatch(/text-success[^>]*>\+150</);
    expect(html).toMatch(/text-danger[^>]*>-20</);
    expect(html).toContain('View changes');
  });

  it('warns when the turn is incomplete', () => {
    const file = { rootPath: '/r', path: 'a.ts', status: 'modified' as const, additions: 1, deletions: 0 };
    seed({ files: [file], incomplete: true });
    expect(render()).toMatch(/text-text-tertiary[^>]*>Changes may be incomplete</);
    seed({ files: [file] });
    expect(render()).not.toContain('incomplete');
  });

  it('says Created when every file is added', () => {
    seed({
      files: [{ rootPath: '/r', path: 'new.ts', status: 'added', additions: 3, deletions: 0 }],
    });
    expect(render()).toContain('Created 1 file');
  });

  const file = (path: string, status: 'added' | 'modified') => ({
    rootPath: '/r', path, status, additions: 1, deletions: 0,
  });

  it('reads Edited 1 file for one modified file', () => {
    seed({ files: [file('a.ts', 'modified')] });
    expect(render()).toContain('Edited 1 file<');
  });

  it('reads Created 2 files when all are added', () => {
    seed({ files: [file('a.ts', 'added'), file('b.ts', 'added')] });
    expect(render()).toContain('Created 2 files');
  });

  it('reads Edited for mixed added and modified files', () => {
    seed({ files: [file('a.ts', 'added'), file('b.ts', 'modified')] });
    expect(render()).toContain('Edited 2 files');
  });

  it('shows the reason and no button when unavailable', () => {
    seed({ unavailableReason: 'not a git repo' });
    const html = render();
    expect(html).toContain('Diff unavailable: not a git repo');
    expect(html).not.toContain('View changes');
  });

  it('lists at most 10 files and counts the rest', () => {
    const files = Array.from({ length: 13 }, (_, i) => ({
      rootPath: '/r',
      path: `f${i}.ts`,
      status: 'modified' as const,
      additions: 1,
      deletions: 0,
    }));
    seed({ files });
    const html = render();
    expect(html).toContain('Edited 13 files');
    expect(html).toContain('f9.ts');
    expect(html).not.toContain('f10.ts');
    expect(html).toContain('and 3 more files');
  });

  it('uses the singular for one more file and shows no line at 10 files', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        rootPath: '/r',
        path: `f${i}.ts`,
        status: 'modified' as const,
        additions: 1,
        deletions: 0,
      }));
    seed({ files: make(11) });
    expect(render()).toContain('and 1 more file<');
    seed({ files: make(10) });
    expect(render()).not.toContain('more file');
  });
});
