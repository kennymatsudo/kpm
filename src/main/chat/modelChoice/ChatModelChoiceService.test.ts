import { describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { ChatSessionRepository } from '../../db/repositories/impl/ChatSessionRepository';
import {
  createChatModelChoiceService,
  type ChatModelChoiceDefaults,
} from './ChatModelChoiceService';
import type { ChatProvider, PiProviderOption, ProvidersReadiness } from '../../../shared/types';

function ready(): ProvidersReadiness {
  return {
    anyReady: true,
    byProvider: Object.fromEntries((['claude', 'codex', 'pi'] as const).map((provider) => [provider, {
      provider,
      state: 'ready',
      detail: 'Ready',
    }])) as ProvidersReadiness['byProvider'],
  };
}

function harness(
  provider: ChatProvider = 'claude',
  piProviders: PiProviderOption[] = [
    { provider: 'cursor', modelId: 'auto', label: 'Cursor Auto', safe: true },
  ],
  piDefault: string | null = 'cursor/auto',
) {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, claude_session_id TEXT,
      provider TEXT NOT NULL DEFAULT 'claude', provider_session_id TEXT,
      scope TEXT NOT NULL DEFAULT 'main', focus_document_path TEXT,
      focus_document_title TEXT, focus_document_hash TEXT, last_opened_at TEXT,
      title TEXT, chat_model_choice TEXT, chat_model_choice_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const sessions = new ChatSessionRepository(db);
  const defaults: ChatModelChoiceDefaults = {
    provider,
    models: { claude: 'sonnet', codex: 'gpt-5.6-sol', pi: piDefault },
    effort: 'medium',
  };
  const getDefaults = vi.fn(() => defaults);
  const service = createChatModelChoiceService({
    chatSessions: sessions,
    getDefaults,
    getReadiness: async () => ready(),
    listPiProviders: async () => piProviders,
  });
  return { db, sessions, defaults, getDefaults, service };
}

describe('ChatModelChoiceService', () => {
  it('snapshots defaults once for a newly opened empty Chat', async () => {
    const h = harness();
    const first = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(first.ok && first.data.selected).toEqual({ provider: 'claude', model: 'sonnet', effort: 'medium' });

    h.defaults.models.claude = 'opus';
    const second = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(second.ok && second.data.selected.model).toBe('sonnet');
    h.db.close();
  });

  it('remembers each provider model and effort and detects revision conflicts', async () => {
    const h = harness();
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    if (!opened.ok) throw new Error(opened.error);
    const codex = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: opened.data.revision,
      intent: { type: 'choose_provider', provider: 'codex' },
    });
    if (!codex.ok) throw new Error(codex.error);
    const effort = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: codex.data.revision,
      intent: { type: 'choose_effort', effort: 'xhigh' },
    });
    expect(effort.ok && effort.data.selected.effort).toBe('xhigh');
    if (!effort.ok) throw new Error(effort.error);
    const claude = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: effort.data.revision,
      intent: { type: 'choose_provider', provider: 'claude' },
    });
    if (!claude.ok) throw new Error(claude.error);
    expect(claude.data.selected).toEqual({ provider: 'claude', model: 'sonnet', effort: 'medium' });
    const codexAgain = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: claude.data.revision,
      intent: { type: 'choose_provider', provider: 'codex' },
    });
    expect(codexAgain.ok && codexAgain.data.selected.effort).toBe('xhigh');

    const conflict = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: opened.data.revision,
      intent: { type: 'choose_provider', provider: 'pi' },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error).toContain('another view');
    h.db.close();
  });

  it('resets unsupported effort to the selected model default for main and focus Chats', async () => {
    const h = harness();
    const main = await h.service.open({ projectId: 'p1', chatSessionId: 'main-1', scope: 'main' });
    const focus = await h.service.open({
      projectId: 'p1', chatSessionId: 'focus-1', scope: 'focus_document',
      focusDocument: { path: 'a.md', title: 'A', contentHash: 'h' },
    });
    expect(main.ok && main.data.selected).toEqual(focus.ok && focus.data.selected);
    if (!main.ok) throw new Error(main.error);
    const opus = await h.service.change({
      projectId: 'p1', chatSessionId: 'main-1', expectedRevision: main.data.revision,
      intent: { type: 'choose_model', model: 'opus' },
    });
    expect(opus.ok && opus.data.selected).toEqual({ provider: 'claude', model: 'opus', effort: null });
    h.db.close();
  });

  it('uses the first safe available pi option when the configured pi default is unset', async () => {
    const h = harness('pi', [
      { provider: 'unsafe-extension', modelId: 'fast', label: 'Unsafe Fast', safe: false },
      { provider: 'openai-codex', modelId: 'gpt-5.4', label: 'OpenAI Codex', safe: true },
    ], null);

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'safe-pi', scope: 'main' });

    expect(opened.ok && opened.data.selected.model).toBe('openai-codex/gpt-5.4');
    expect(opened.ok && opened.data.send.allowed).toBe(true);
    h.db.close();
  });

  it('leaves pi explicitly unselected when its default is unset and no safe option exists', async () => {
    const h = harness('pi', [
      { provider: 'unsafe-extension', modelId: 'fast', label: 'Unsafe Fast', safe: false },
    ], null);

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'unsafe-only-pi', scope: 'main' });

    expect(opened.ok && opened.data.selected.model).not.toBe('unsafe-extension/fast');
    expect(opened.ok && opened.data.send.allowed).toBe(false);
    expect(opened.ok && opened.data.send.reason).toContain('No safe pi model');
    h.db.close();
  });

  it('preserves an unavailable configured choice and blocks turn resolution', async () => {
    const h = harness('pi');
    h.defaults.models.pi = 'missing/model';
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'focus-1', scope: 'focus_document', focusDocument: { path: 'a.md', title: 'A', contentHash: 'h' } });
    expect(opened.ok && opened.data.send.allowed).toBe(false);
    expect(opened.ok && opened.data.providers.find((p) => p.provider === 'pi')?.models[0].id).toBe('missing/model');
    const resolved = await h.service.resolveForTurn('p1', 'focus-1');
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toContain('no longer available');
    h.db.close();
  });

  it('resolves a focused Chat using its persisted focus scope', async () => {
    const h = harness();
    const opened = await h.service.open({
      projectId: 'p1',
      chatSessionId: 'focus-resolve',
      scope: 'focus_document',
      focusDocument: { path: 'docs/focus.md', title: 'Focus', contentHash: 'hash' },
    });
    if (!opened.ok) throw new Error(opened.error);

    const resolved = await h.service.resolveForTurn('p1', 'focus-resolve');

    expect(resolved).toEqual({
      ok: true,
      data: { provider: 'claude', model: 'sonnet', effort: 'medium', revision: opened.data.revision },
    });
    expect(h.sessions.get('focus-resolve')?.scope).toBe('focus_document');
    h.db.close();
  });

  it('continues with the authoritative aggregate when legacy adoption loses a race', async () => {
    const h = harness();
    h.sessions.create('legacy-race', 'p1', 'codex');
    const persistCompetingOpen = h.sessions.updateModelChoice.bind(h.sessions);
    vi.spyOn(h.sessions, 'updateModelChoice').mockImplementationOnce((id, revision, aggregateJson) => {
      expect(persistCompetingOpen(id, revision, aggregateJson)).toBeDefined();
      return undefined;
    });

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'legacy-race', scope: 'main' });

    expect(opened.ok && opened.data.selected).toEqual({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'medium',
    });
    expect(opened.ok && opened.data.revision).toBe(1);
    h.db.close();
  });

  it('continues with the authoritative aggregate when effort normalization loses a race', async () => {
    const h = harness();
    h.sessions.create('effort-race', 'p1', 'codex');
    h.sessions.updateModelChoice('effort-race', 0, JSON.stringify({
      version: 1,
      selectedProvider: 'codex',
      remembered: {
        claude: { model: 'sonnet', effort: 'medium' },
        codex: { model: 'gpt-5.6-sol', effort: 'max' },
        pi: { model: 'cursor/auto', effort: 'medium' },
      },
    }));
    const persistCompetingOpen = h.sessions.updateModelChoice.bind(h.sessions);
    vi.spyOn(h.sessions, 'updateModelChoice').mockImplementationOnce((id, revision, aggregateJson) => {
      expect(persistCompetingOpen(id, revision, aggregateJson)).toBeDefined();
      return undefined;
    });

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'effort-race', scope: 'main' });

    expect(opened.ok && opened.data.selected.effort).toBe('medium');
    expect(opened.ok && opened.data.revision).toBe(2);
    h.db.close();
  });

  it('adopts a legacy row provider exactly once without mutating global settings', async () => {
    const h = harness();
    h.sessions.create('legacy', 'p1', 'codex');
    const first = await h.service.open({ projectId: 'p1', chatSessionId: 'legacy', scope: 'main' });
    expect(first.ok && first.data.selected).toEqual({ provider: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
    expect(h.getDefaults).toHaveBeenCalled();
    expect(h.defaults.provider).toBe('claude');
    const persisted = h.sessions.get('legacy');
    expect(persisted?.chat_model_choice_revision).toBe(1);
    h.db.close();
  });
});
