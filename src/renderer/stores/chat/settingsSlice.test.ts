import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { installMockApi } from '../../../../tests/mocks/electron-api';
import { createInitialChatState, createInitialPerSessionState } from './baseState';
import { createSettingsSlice } from './settingsSlice';
import type { ChatChoiceView } from '../../../shared/types';

function createTestStore() {
  return createStore<ReturnType<typeof createInitialChatState> & ReturnType<typeof createSettingsSlice>>()((set, get) => ({
    ...createInitialChatState(),
    ...createSettingsSlice(set as never, get as never),
  }));
}

const choice: ChatChoiceView = {
  revision: 1,
  selected: { provider: 'claude', model: 'sonnet', effort: 'medium' },
  remembered: {
    claude: { model: 'sonnet', effort: 'medium' },
    codex: { model: 'gpt-5.6-sol', effort: 'medium' },
    pi: { model: 'cursor/auto', effort: 'medium' },
  },
  providers: [{
    provider: 'claude', label: 'Claude', available: true, detail: 'Ready', models: [
      { id: 'sonnet', label: 'Sonnet', available: true, effortLevels: [], defaultEffort: null },
      { id: 'opus', label: 'Opus', available: true, effortLevels: [], defaultEffort: null },
    ],
  }],
  controlsEnabled: true,
  responding: false,
  send: { allowed: true },
};

describe('settingsSlice', () => {
  beforeEach(() => installMockApi());

  it('updates the global default only through the default action', () => {
    const store = createTestStore();
    store.getState().setDefaultModel('opus');
    expect(store.getState().model).toBe('opus');
  });

  it('does not turn a missing per-Chat selection into a default mutation', () => {
    const store = createTestStore();
    store.getState().setModel('missing-session', 'opus');
    expect(store.getState().model).toBe('sonnet');
  });

  it('persists a per-Chat model without mutating the global default', async () => {
    const api = installMockApi();
    const nextChoice = {
      ...choice,
      revision: 2,
      selected: { ...choice.selected, model: 'opus' },
      remembered: { ...choice.remembered, claude: { model: 'opus', effort: null } },
    } satisfies ChatChoiceView;
    vi.mocked(api.chat.changeChoice).mockResolvedValue({ success: true, choice: nextChoice });
    const store = createTestStore();
    store.setState({
      persistedProjectId: 'project-a',
      sessions: new Map([['chat-a', { ...createInitialPerSessionState(1), choice }]]),
    });

    await store.getState().changeChatChoice('chat-a', { type: 'choose_model', model: 'opus' });

    expect(api.chat.changeChoice).toHaveBeenCalledWith({
      projectId: 'project-a',
      chatSessionId: 'chat-a',
      expectedRevision: 1,
      intent: { type: 'choose_model', model: 'opus' },
    });
    expect(store.getState().sessions.get('chat-a')?.model).toBe('opus');
    expect(store.getState().model).toBe('sonnet');
  });
});
