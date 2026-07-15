import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SessionHistory } from './SessionHistory';

const { chatState, projectState } = vi.hoisted(() => ({
  chatState: {
    viewedSessionId: 'running-session',
    sessions: new Map([
      ['running-session', { isStreaming: true }],
    ]),
    sessionHistory: [],
    loadSessionHistory: vi.fn(),
    loadFromHistory: vi.fn(),
  },
  projectState: {
    currentProjectId: 'project-1',
  },
}));

vi.mock('../../stores', () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) => selector(chatState),
  useProjectDomainStore: Object.assign(
    (selector: (state: typeof projectState) => unknown) => selector(projectState),
    { getState: () => projectState },
  ),
}));

describe('SessionHistory', () => {
  it('keeps the history trigger enabled while the viewed chat is streaming', () => {
    const markup = renderToStaticMarkup(<SessionHistory />);

    expect(markup).toMatch(/<button[^>]*aria-label="Session history"/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Session history"/);
  });
});
