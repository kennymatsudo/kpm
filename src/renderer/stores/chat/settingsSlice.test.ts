import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { setSetting } from '../../services/settingsService';
import { SETTINGS } from '../../../shared/settingsRegistry';
import { createInitialChatState, createInitialPerSessionState } from './baseState';
import { createSettingsSlice } from './settingsSlice';

vi.mock('../../services/settingsService', () => ({
  setSetting: vi.fn(),
}));

function createTestStore() {
  return createStore<ReturnType<typeof createInitialChatState> & ReturnType<typeof createSettingsSlice>>()((set, get) => ({
    ...createInitialChatState(),
    ...createSettingsSlice(set as never, get as never),
  }));
}

describe('settingsSlice', () => {
  beforeEach(() => {
    vi.mocked(setSetting).mockReset();
  });

  it('updates the default model before a session exists', () => {
    const store = createTestStore();

    store.getState().setDefaultModel('opus');

    expect(store.getState().model).toBe('opus');
    expect(setSetting).toHaveBeenCalledWith(SETTINGS.chatModel, 'opus');
  });

  it('falls back to the default model when setting a missing session', () => {
    const store = createTestStore();

    store.getState().setModel('missing-session', 'opus');

    expect(store.getState().model).toBe('opus');
    expect(setSetting).toHaveBeenCalledWith(SETTINGS.chatModel, 'opus');
  });

  it('updates both the session model and the default model', () => {
    const store = createTestStore();
    store.setState({
      sessions: new Map([
        ['chat-a', createInitialPerSessionState(1, 'sonnet')],
      ]),
    });

    store.getState().setModel('chat-a', 'opus');

    expect(store.getState().sessions.get('chat-a')?.model).toBe('opus');
    expect(store.getState().model).toBe('opus');
    expect(setSetting).toHaveBeenCalledWith(SETTINGS.chatModel, 'opus');
  });
});
