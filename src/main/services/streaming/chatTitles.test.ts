import { describe, expect, it, vi } from 'vitest';
import type { GenerationResult } from '../../generation';
import {
  createChatTitler,
  dueTitleStage,
  normalizeGeneratedTitle,
  providerSummaryTitle,
  type ChatTitlerDeps,
  type TitledChat,
} from './chatTitles';

describe('dueTitleStage', () => {
  it.each([
    ['untitled chat after its first turn', { title: null, title_source: null, title_turn: null }, 1, 'opening'],
    ['titled chat before the retitle turn', { title: 'A', title_source: 'generated', title_turn: 1 }, 3, null],
    ['titled chat reaching the retitle turn', { title: 'A', title_source: 'generated', title_turn: 1 }, 4, 'settled'],
    ['chat already retitled', { title: 'A', title_source: 'provider', title_turn: 4 }, 9, null],
    ['chat the user renamed', { title: 'Mine', title_source: 'user', title_turn: null }, 4, null],
    ['title saved before sources were tracked', { title: 'Old', title_source: null, title_turn: null }, 2, 'opening'],
    ['long untitled chat', { title: null, title_source: null, title_turn: null }, 12, 'settled'],
    ['chat with no finished turn', { title: null, title_source: null, title_turn: null }, 0, null],
  ] as const)('%s', (_name, chat, turns, expected) => {
    expect(dueTitleStage(chat, turns)).toBe(expected);
  });
});

describe('providerSummaryTitle', () => {
  it('accepts a real summary', () => {
    expect(providerSummaryTitle({ summary: 'K-Repo support pane removal', firstPrompt: 'Can you create a task to remove the old pane' }))
      .toBe('K-Repo support pane removal');
  });

  it('rejects the first prompt standing in for a summary', () => {
    expect(providerSummaryTitle({ summary: "What's the Qualtrics survey id?", firstPrompt: "What's the Qualtrics survey id?" }))
      .toBeNull();
  });

  it('rejects a prompt-length summary even without a first prompt to compare', () => {
    expect(providerSummaryTitle({ summary: 'So you are saying that our ticket lookup failed. Can you determine why? If you do that, does it succeed?' }))
      .toBeNull();
  });

  it('strips the view hint KPM prepends to the first turn', () => {
    expect(providerSummaryTitle({ summary: '[Context: user is viewing the plan] Plan item field wiring' }))
      .toBe('Plan item field wiring');
  });
});

describe('normalizeGeneratedTitle', () => {
  it('keeps the first line without quotes, label, or trailing period', () => {
    expect(normalizeGeneratedTitle('Title: "Codex write grant toggle."\nextra')).toBe('Codex write grant toggle');
  });
});

function generated(text: string): GenerationResult {
  return { provider: 'claude', model: 'haiku', text, outcome: { status: 'completed' }, errors: [] };
}

function makeTitler(chat: TitledChat, completedTurns: number, overrides: Partial<ChatTitlerDeps> = {}) {
  let stored: TitledChat = chat;
  const deps: ChatTitlerDeps = {
    countCompletedTurns: () => completedTurns,
    getChat: () => stored,
    getMessages: () => [
      { role: 'user', content: 'Why does the Codex write toggle not stick?' },
      { role: 'assistant', content: 'The consent decision was discarded.' },
    ],
    saveTitle: vi.fn((_id, title, source, turn) => { stored = { ...stored, title, title_source: source, title_turn: turn }; }),
    onTitle: vi.fn(),
    generate: vi.fn(async () => generated('Codex write toggle')),
    ...overrides,
  };
  return { titler: createChatTitler(deps), deps, setStored: (next: TitledChat) => { stored = next; } };
}

const untitled: TitledChat = { title: null, title_source: null, title_turn: null, scope: 'main' };
const input = { projectId: 'p1', chatSessionId: 'c1' };

describe('createChatTitler', () => {
  it('uses a real provider summary without generating one', async () => {
    const { titler, deps } = makeTitler(untitled, 1);
    await titler.onTurnCompleted({ ...input, fetchProviderSummary: async () => ({ summary: 'Codex write consent' }) });

    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.saveTitle).toHaveBeenCalledWith('c1', 'Codex write consent', 'provider', 1);
    expect(deps.onTitle).toHaveBeenCalledWith('p1', 'c1', 'Codex write consent');
  });

  it('generates a title when the provider only has the first prompt', async () => {
    const { titler, deps } = makeTitler(untitled, 1);
    await titler.onTurnCompleted({
      ...input,
      fetchProviderSummary: async () => ({ summary: 'Why does it fail?', firstPrompt: 'Why does it fail?' }),
    });

    expect(deps.saveTitle).toHaveBeenCalledWith('c1', 'Codex write toggle', 'generated', 1);
  });

  it('does nothing on a turn that is not due a title', async () => {
    const { titler, deps } = makeTitler({ title: 'Codex write toggle', title_source: 'generated', title_turn: 1 }, 2);
    const fetchProviderSummary = vi.fn();
    await titler.onTurnCompleted({ ...input, fetchProviderSummary });

    expect(fetchProviderSummary).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('keeps a rename the user made while the title was being written', async () => {
    const holder: { setStored?: (next: TitledChat) => void } = {};
    const { titler, deps, setStored } = makeTitler(untitled, 1, {
      generate: vi.fn(async () => {
        holder.setStored?.({ title: 'Mine', title_source: 'user', title_turn: null });
        return generated('Codex write toggle');
      }),
    });
    holder.setStored = setStored;
    await titler.onTurnCompleted(input);

    expect(deps.saveTitle).not.toHaveBeenCalled();
  });

  it('leaves focus-document chats untitled', async () => {
    const { titler, deps } = makeTitler({ ...untitled, scope: 'focus_document' }, 1);
    await titler.onTurnCompleted(input);

    expect(deps.generate).not.toHaveBeenCalled();
  });
});
