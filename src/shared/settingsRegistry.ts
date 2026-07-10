/**
 * Typed definitions for the settings persisted in the `app_settings` key-value
 * store. Each definition owns one setting's storage key, its type, its default,
 * and how it is (de)serialized — so callers read and write a typed value and
 * never hand-parse a raw string or restate a default at the call site.
 *
 * A definition is a pure codec. The per-process transport (the renderer's
 * async IPC and the main process's synchronous repository) is wired in each
 * process's own typed accessor.
 */

import {
  CODEX_CHAT_MODELS,
  type ClaudeModel,
  type ChatEffortLevel,
  type CodexChatModel,
} from './types';
import {
  CHAT_APPROVAL_MODES,
  CHAT_PROVIDERS,
  DEFAULT_CHAT_APPROVAL_MODE,
  DEFAULT_CHAT_PROVIDER,
  type ChatApprovalMode,
  type ChatProvider,
} from './appSettings';

/**
 * A single setting: its storage key plus the codec that turns a stored string
 * into a typed value (folding the default for unset/invalid input) and back.
 */
export interface SettingDefinition<T> {
  readonly key: string;
  /** Turn a raw stored string (or absence) into a typed value. Never throws. */
  decode(raw: string | null | undefined): T;
  /** Turn a typed value into the string to persist. */
  encode(value: T): string;
}

/**
 * Build a codec for a setting whose value is one of a fixed set of strings,
 * folding anything else (including unset) to `fallback`.
 */
function enumSetting<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): SettingDefinition<T> {
  const valid = new Set<string>(allowed);
  return {
    key,
    decode: (raw) => (raw != null && valid.has(raw) ? (raw as T) : fallback),
    encode: (value) => value,
  };
}

const CODEX_MODEL_VALUES = CODEX_CHAT_MODELS.map((option) => option.value);
const DEFAULT_CODEX_MODEL: CodexChatModel = CODEX_CHAT_MODELS[0].value;

const chatPiProviderModel: SettingDefinition<string | null> = {
  key: 'chat_pi_provider_model',
  decode: (raw) => (raw ? raw : null),
  encode: (value) => value ?? '',
};

const chatPiAckUnsafeProviders: SettingDefinition<Set<string>> = {
  key: 'chat_pi_ack_unsafe_providers',
  decode: (raw) => {
    if (!raw) return new Set();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
    } catch {
      return new Set();
    }
  },
  encode: (value) => JSON.stringify(Array.from(value)),
};

const branchNameTemplate: SettingDefinition<string> = {
  key: 'branch_name_template',
  decode: (raw) => raw ?? '',
  encode: (value) => value,
};

/** The typed settings that live in the `app_settings` key-value store. */
export const SETTINGS = {
  chatApprovalMode: enumSetting<ChatApprovalMode>(
    'chat_approval_mode',
    CHAT_APPROVAL_MODES,
    DEFAULT_CHAT_APPROVAL_MODE
  ),
  chatProvider: enumSetting<ChatProvider>('chat_provider', CHAT_PROVIDERS, DEFAULT_CHAT_PROVIDER),
  chatModel: enumSetting<ClaudeModel>('chat_model', ['opus', 'sonnet'], 'sonnet'),
  chatEffort: enumSetting<ChatEffortLevel>(
    'chat_effort',
    ['low', 'medium', 'high', 'max'],
    'medium'
  ),
  chatCodexModel: enumSetting<CodexChatModel>(
    'chat_codex_model',
    CODEX_MODEL_VALUES,
    DEFAULT_CODEX_MODEL
  ),
  chatPiProviderModel,
  chatPiAckUnsafeProviders,
  branchNameTemplate,
} as const;
