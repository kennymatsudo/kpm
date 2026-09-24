import { describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { ChatSessionRepository } from '../../db/repositories/impl/ChatSessionRepository';
import {
  createChatModelChoiceService,
  type ChatModelChoiceDefaults,
} from './ChatModelChoiceService';
import type { ChatProvider, PiProviderOption, ProvidersReadiness } from '../../../shared/types';
import { FALLBACK_MODEL_CATALOG, type ModelCatalog } from '../../../shared/modelCatalog';

/** A fetched list: each model carries the effort its provider would start it at. */
const CATALOG: ModelCatalog = {
  claude: [
    { id: 'sonnet', label: 'Sonnet 5', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'], providerDefaultEffort: 'high' },
    { id: 'opus', label: 'Opus 5.5', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'], providerDefaultEffort: 'medium' },
  ],
  codex: FALLBACK_MODEL_CATALOG.codex.map((model) => ({ ...model, providerDefaultEffort: 'medium' as const })),
};

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
  catalog: ModelCatalog = CATALOG,
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
  };
  const getDefaults = vi.fn(() => defaults);
  const listPiProviders = vi.fn(async () => piProviders);
  const service = createChatModelChoiceService({
    chatSessions: sessions,
    getDefaults,
    getReadiness: async () => ready(),
    listPiProviders,
    getModelCatalog: () => catalog,
  });
  return { db, sessions, defaults, getDefaults, listPiProviders, service };
}

describe('ChatModelChoiceService', () => {
  it('snapshots defaults once for a newly opened empty Chat', async () => {
    const h = harness();
    const first = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(first.ok && first.data.selected).toEqual({ provider: 'claude', model: 'sonnet', effort: 'high' });

    h.defaults.models.claude = 'opus';
    const second = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(second.ok && second.data.selected.model).toBe('sonnet');
    h.db.close();
  });

  it('publishes each model\'s context window so the composer need not read a provider catalog', async () => {
    const h = harness('codex');
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'codex-1', scope: 'main' });

    const codex = opened.ok
      ? opened.data.providers.find((provider) => provider.provider === 'codex')
      : undefined;
    expect(codex?.models.every((model) => (model.contextWindow ?? 0) > 0)).toBe(true);
    h.db.close();
  });

  it('starts a new Chat at the effort the provider would pick for the model', async () => {
    const h = harness('codex');
    h.defaults.models.codex = 'gpt-5.6-terra';

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'codex-1', scope: 'main' });

    expect(opened.ok && opened.data.selected).toEqual({ provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' });
    h.db.close();
  });

  it('starts at a real level even before the provider has been asked', async () => {
    const h = harness('claude', undefined, undefined, FALLBACK_MODEL_CATALOG);

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });

    expect(opened.ok && opened.data.selected.effort).toBe('medium');
    h.db.close();
  });

  it('starts a new pi Chat on the model the user\'s own pi CLI defaults to', async () => {
    const h = harness('pi', [
      { provider: 'openai-codex', modelId: 'gpt-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'openai-codex', modelId: 'gpt-5.6-terra', label: 'OpenAI Codex — Terra', safe: true, isDefault: true },
    ], null);

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'pi-1', scope: 'main' });

    expect(opened.ok && opened.data.selected.model).toBe('openai-codex/gpt-5.6-terra');
    h.db.close();
  });

  it('falls back to the first safe pi model when pi declares no default', async () => {
    const h = harness('pi', [
      { provider: 'unknown-vendor', modelId: 'x', label: 'Unknown — X', safe: false },
      { provider: 'openai-codex', modelId: 'gpt-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
    ], null);

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'pi-2', scope: 'main' });

    expect(opened.ok && opened.data.selected.model).toBe('openai-codex/gpt-5.4');
    h.db.close();
  });

  it('keeps an explicit Settings pi model ahead of pi\'s own default', async () => {
    const h = harness('pi', [
      { provider: 'openai-codex', modelId: 'gpt-5.4', label: 'OpenAI Codex — GPT-5.4', safe: true },
      { provider: 'openai-codex', modelId: 'gpt-5.6-terra', label: 'OpenAI Codex — Terra', safe: true, isDefault: true },
    ], 'openai-codex/gpt-5.4');

    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'pi-3', scope: 'main' });

    expect(opened.ok && opened.data.selected.model).toBe('openai-codex/gpt-5.4');
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
    expect(claude.data.selected).toEqual({ provider: 'claude', model: 'sonnet', effort: 'high' });
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

  it('moves to the new model\'s own default effort when the model changes, for main and focus Chats', async () => {
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
    expect(opus.ok && opus.data.selected).toEqual({ provider: 'claude', model: 'opus', effort: 'medium' });
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
      data: { provider: 'claude', model: 'sonnet', effort: 'high', revision: opened.data.revision },
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
        codex: { model: 'gpt-5.6-sol', effort: 'off' },
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

  it('does not enumerate pi providers when opening a non-pi Chat', async () => {
    const h = harness('claude');
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(opened.ok).toBe(true);
    expect(h.listPiProviders).not.toHaveBeenCalled();
    h.db.close();
  });

  it('enumerates pi providers when opening a pi Chat', async () => {
    const h = harness('pi');
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    expect(opened.ok).toBe(true);
    expect(h.listPiProviders).toHaveBeenCalled();
    h.db.close();
  });

  it('enumerates pi providers only when the change targets pi', async () => {
    const h = harness('claude');
    const opened = await h.service.open({ projectId: 'p1', chatSessionId: 'c1', scope: 'main' });
    if (!opened.ok) throw new Error(opened.error);
    h.listPiProviders.mockClear();

    const toCodex = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: opened.data.revision,
      intent: { type: 'choose_provider', provider: 'codex' },
    });
    if (!toCodex.ok) throw new Error(toCodex.error);
    expect(h.listPiProviders).not.toHaveBeenCalled();

    const toPi = await h.service.change({
      projectId: 'p1', chatSessionId: 'c1', expectedRevision: toCodex.data.revision,
      intent: { type: 'choose_provider', provider: 'pi' },
    });
    if (!toPi.ok) throw new Error(toPi.error);
    expect(h.listPiProviders).toHaveBeenCalledTimes(1);
    expect((toPi.data.providers.find((p) => p.provider === 'pi')?.models.length ?? 0)).toBeGreaterThan(0);
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
