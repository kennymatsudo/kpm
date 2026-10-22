import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MODEL_CATALOG,
  formatModelName,
  formatRecordedModelName,
  parseClaudeModels,
  parseCodexModelList,
  type ModelCatalog,
} from './modelCatalog';

const FETCHED: ModelCatalog = {
  claude: [
    { id: 'sonnet', label: 'Sonnet 5', resolvedModel: 'claude-sonnet-5', effortLevels: ['low', 'medium'] },
    { id: 'opus', label: 'Opus 5.5', resolvedModel: 'claude-opus-5-5', effortLevels: ['low', 'medium'] },
  ],
  codex: [{ id: 'gpt-6-astra', label: 'GPT-6-Astra', effortLevels: ['low'] }],
};

describe('parseClaudeModels', () => {
  const rows = [
    { value: 'default', resolvedModel: 'claude-sonnet-5', displayName: 'Default (recommended)', description: 'Sonnet 5' },
    { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'Most capable', supportedEffortLevels: ['low', 'max', 'turbo'] },
    { value: 'claude-opus-5', displayName: 'Opus 5', description: 'Pinned' },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet 5', description: 'Everyday' },
  ];

  it('keeps only the aliases KPM offers, in KPM order, named by Claude', () => {
    expect(parseClaudeModels(rows)?.map((model) => [model.id, model.label, model.resolvedModel])).toEqual([
      ['sonnet', 'Sonnet 5', 'claude-sonnet-5'],
      ['opus', 'Opus 5.5', 'claude-opus-5-5'],
    ]);
  });

  it('drops effort levels KPM cannot send', () => {
    expect(parseClaudeModels(rows)?.find((model) => model.id === 'opus')?.effortLevels).toEqual(['low', 'max']);
  });

  it('keeps the fallback row for an alias Claude stops listing', () => {
    expect(parseClaudeModels([rows[1]])?.[0]).toEqual(FALLBACK_MODEL_CATALOG.claude[0]);
  });

  it('reports no result when none of the aliases are listed', () => {
    expect(parseClaudeModels([rows[0], rows[2]])).toBeNull();
  });
});

describe('parseCodexModelList', () => {
  const result = {
    data: [
      { id: 'gpt-6-astra', displayName: 'GPT-6-Astra', description: 'Frontier', hidden: false, isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'ultra' }] },
      { id: 'gpt-5.6-terra', displayName: 'GPT-5.6-Terra', hidden: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] },
      { id: 'codex-auto-review', displayName: 'Codex Auto Review', hidden: true, supportedReasoningEfforts: [] },
    ],
    nextCursor: null,
  };

  it('lists visible models with Codex names, defaults, and sendable efforts', () => {
    expect(parseCodexModelList(result)?.[0]).toEqual({
      id: 'gpt-6-astra',
      label: 'GPT-6-Astra',
      description: 'Frontier',
      effortLevels: ['low'],
      providerDefaultEffort: 'low',
      isProviderDefault: true,
    });
  });

  it('skips models Codex marks hidden', () => {
    expect(parseCodexModelList(result)?.map((model) => model.id)).toEqual(['gpt-6-astra', 'gpt-5.6-terra']);
  });

  it('keeps the known context window, which Codex does not publish here', () => {
    expect(parseCodexModelList(result)?.[1].contextWindow).toBe(372_000);
  });

  it('reports no result for a malformed or empty response', () => {
    expect(parseCodexModelList({ data: 'nope' })).toBeNull();
    expect(parseCodexModelList({ data: [] })).toBeNull();
  });
});

describe('formatModelName', () => {
  it('names an alias by what it points at today', () => {
    expect(formatModelName('opus', FETCHED)).toBe('Opus 5.5');
  });

  it('leaves an alias unversioned before any list is fetched', () => {
    expect(formatModelName('opus')).toBe('Opus');
  });

  it('names a full id the list knows the same way as its alias', () => {
    expect(formatModelName('claude-opus-5-5', FETCHED)).toBe('Opus 5.5');
  });

  it('names Codex models the way Codex does', () => {
    expect(formatModelName('gpt-6-astra', FETCHED)).toBe('GPT-6-Astra');
  });

  it('labels major-only model ids', () => {
    expect(formatModelName('claude-opus-5')).toBe('Opus 5');
    expect(formatModelName('claude-sonnet-5')).toBe('Sonnet 5');
  });

  it('labels major.minor model ids', () => {
    expect(formatModelName('claude-opus-4-8')).toBe('Opus 4.8');
    expect(formatModelName('claude-haiku-4-5')).toBe('Haiku 4.5');
  });

  it('labels pi provider selectors', () => {
    expect(formatModelName('cursor/opus-latest@1m')).toBe('cursor · opus-latest@1m');
  });

  it('uppercases the gpt prefix on unknown Codex model ids', () => {
    expect(formatModelName('gpt-5-codex')).toBe('GPT-5-codex');
  });
});

describe('formatRecordedModelName', () => {
  it('does not label a saved alias with the version it points at today', () => {
    expect(formatRecordedModelName('opus', FETCHED)).toBe('Opus');
  });

  it('still names concrete ids from the list', () => {
    expect(formatRecordedModelName('claude-opus-5-5', FETCHED)).toBe('Opus 5.5');
    expect(formatRecordedModelName('gpt-6-astra', FETCHED)).toBe('GPT-6-Astra');
  });

  it('names an older concrete id the list no longer has', () => {
    expect(formatRecordedModelName('claude-opus-5', FETCHED)).toBe('Opus 5');
  });
});

describe('parseClaudeModels default effort', () => {
  it('carries the effort Claude would send for the alias', () => {
    const [sonnet] = parseClaudeModels([
      { value: 'sonnet', displayName: 'Sonnet 5', description: '', supportedEffortLevels: ['low', 'high'], defaultEffort: 'high' },
    ]) ?? [];
    expect(sonnet.providerDefaultEffort).toBe('high');
  });
});
