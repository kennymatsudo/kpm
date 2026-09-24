import { CODEX_CHAT_MODELS, type ChatChoiceEffort, type ClaudeModel } from './types';

/**
 * The models each provider offers, as the provider itself describes them.
 *
 * The main process fetches this from Claude and Codex at launch and saves the
 * last good copy, so pickers never wait on a provider. `FALLBACK_MODEL_CATALOG`
 * only stands in before the first successful fetch, or when a provider cannot
 * be reached.
 */
export interface CatalogModel {
  /** The id KPM sends: a Claude alias such as `opus`, or a Codex model id. */
  id: string;
  label: string;
  description?: string;
  /** What the id points at today, e.g. `opus` -> `claude-opus-5-5`. */
  resolvedModel?: string;
  effortLevels: ChatChoiceEffort[];
  /** The provider's own starting effort for this model, when it publishes one. */
  providerDefaultEffort?: ChatChoiceEffort;
  /** The model the provider's own CLI starts new sessions on. */
  isProviderDefault?: boolean;
  contextWindow?: number;
}

export interface ModelCatalog {
  claude: CatalogModel[];
  codex: CatalogModel[];
}

/**
 * KPM offers Claude's moving aliases only. They advance to each new model on
 * their own, so a pinned id like `claude-opus-5` would be the one thing here
 * that goes stale.
 */
export const CLAUDE_CHAT_MODEL_IDS: readonly ClaudeModel[] = ['sonnet', 'opus'];

const KNOWN_EFFORTS = new Set<string>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

const CLAUDE_FALLBACK_EFFORTS: ChatChoiceEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const FALLBACK_MODEL_CATALOG: ModelCatalog = {
  // Unversioned on purpose: without a fetch, KPM cannot know which version the alias points at.
  claude: [
    { id: 'sonnet', label: 'Sonnet', effortLevels: CLAUDE_FALLBACK_EFFORTS },
    { id: 'opus', label: 'Opus', effortLevels: CLAUDE_FALLBACK_EFFORTS },
  ],
  codex: CODEX_CHAT_MODELS.map((model) => ({
    id: model.value,
    label: model.label,
    description: model.description,
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: model.contextWindow,
  })),
};

function knownEfforts(values: unknown[]): ChatChoiceEffort[] {
  return values.filter((value): value is ChatChoiceEffort => typeof value === 'string' && KNOWN_EFFORTS.has(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The fields KPM reads from the Claude SDK's `supportedModels()` rows. */
export interface ClaudeSupportedModel {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description: string;
  supportedEffortLevels?: string[];
  /** The effort a turn on this model would send; KPM reads it from the session's applied settings. */
  defaultEffort?: string;
}

/**
 * Keep only the aliases KPM offers, in KPM's order. An alias the SDK stops
 * listing keeps its fallback row so a saved choice stays selectable.
 * Returns null when the response has none of them, so the caller keeps its
 * previous catalog instead of saving an empty one.
 */
export function parseClaudeModels(rows: ClaudeSupportedModel[]): CatalogModel[] | null {
  let matched = false;
  const models = CLAUDE_CHAT_MODEL_IDS.map((id) => {
    const row = rows.find((candidate) => candidate.value === id);
    if (!row) return FALLBACK_MODEL_CATALOG.claude.find((model) => model.id === id)!;
    matched = true;
    const [providerDefaultEffort] = knownEfforts([row.defaultEffort]);
    return {
      id,
      label: row.displayName,
      description: row.description,
      ...(row.resolvedModel ? { resolvedModel: row.resolvedModel } : {}),
      effortLevels: knownEfforts(row.supportedEffortLevels ?? []),
      ...(providerDefaultEffort ? { providerDefaultEffort } : {}),
    };
  });
  return matched ? models : null;
}

/**
 * Parse a Codex app-server `model/list` result. Models Codex marks hidden are
 * its internal ones (auto-review and similar), not choices for a person.
 * Codex does not publish context windows here, so known models keep KPM's.
 */
export function parseCodexModelList(result: unknown): CatalogModel[] | null {
  if (!isObject(result) || !Array.isArray(result.data)) return null;
  const models: CatalogModel[] = [];
  for (const entry of result.data) {
    if (!isObject(entry) || typeof entry.id !== 'string' || entry.hidden === true) continue;
    const efforts = Array.isArray(entry.supportedReasoningEfforts)
      ? entry.supportedReasoningEfforts.map((effort) => isObject(effort) ? effort.reasoningEffort : undefined)
      : [];
    const [providerDefaultEffort] = knownEfforts([entry.defaultReasoningEffort]);
    const contextWindow = FALLBACK_MODEL_CATALOG.codex.find((model) => model.id === entry.id)?.contextWindow;
    models.push({
      id: entry.id,
      label: typeof entry.displayName === 'string' && entry.displayName ? entry.displayName : entry.id,
      ...(typeof entry.description === 'string' && entry.description ? { description: entry.description } : {}),
      effortLevels: knownEfforts(efforts),
      ...(providerDefaultEffort ? { providerDefaultEffort } : {}),
      ...(entry.isDefault === true ? { isProviderDefault: true } : {}),
      ...(contextWindow ? { contextWindow } : {}),
    });
  }
  return models.length > 0 ? models : null;
}

/**
 * One display name for any model id KPM stores: a Claude alias, a full Claude
 * id, a Codex id, or a pi `provider/modelId` selector. Every surface that
 * shows a model goes through here so the same model never reads two ways.
 */
export function formatModelName(model: string, catalog: ModelCatalog = FALLBACK_MODEL_CATALOG): string {
  const known = [...catalog.claude, ...catalog.codex]
    .find((entry) => entry.id === model || entry.resolvedModel === model);
  if (known) return known.label;
  const piSelectorLabel = formatPiSelector(model);
  if (piSelectorLabel) return piSelectorLabel;
  // Compact a full model id like "claude-<family>-<major>-<minor>" to "<Family> <major>.<minor>"
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return modelWithVersion('Opus', model);
  if (lower.includes('sonnet')) return modelWithVersion('Sonnet', model);
  if (lower.includes('haiku')) return modelWithVersion('Haiku', model);
  if (lower.startsWith('gpt-')) return formatGptModel(model);
  return model;
}

/**
 * The display name for a model id saved with past activity (usage rows, chat
 * replies). Unlike `formatModelName`, a bare Claude alias is never labelled
 * with today's version: a row saved as `opus` last month may have come from
 * an older Opus, so it reads as plain "Opus". Concrete ids (Codex ids, full
 * Claude ids) still get the provider's name.
 */
export function formatRecordedModelName(model: string, catalog: ModelCatalog = FALLBACK_MODEL_CATALOG): string {
  const concrete = catalog.codex.find((entry) => entry.id === model)
    ?? catalog.claude.find((entry) => entry.resolvedModel === model);
  return concrete ? concrete.label : formatModelName(model);
}

function formatGptModel(raw: string): string {
  return raw
    .split('-')
    .map((part) => part === 'gpt' ? 'GPT' : part)
    .join('-');
}

function formatPiSelector(model: string): string | null {
  const separatorIndex = model.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) return null;
  const provider = model.slice(0, separatorIndex);
  const modelId = model.slice(separatorIndex + 1);
  return `${provider} · ${modelId}`;
}

function modelWithVersion(label: string, raw: string): string {
  const versionMatch = /(\d+)(?:[-.](\d+))?/.exec(raw);
  if (!versionMatch) return label;
  const [, major, minor] = versionMatch;
  return minor ? `${label} ${major}.${minor}` : `${label} ${major}`;
}
