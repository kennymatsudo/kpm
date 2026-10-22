import os from 'os';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { CLAUDE_CHAT_MODEL_IDS, type ClaudeSupportedModel } from '../../shared/modelCatalog';
import { getConfig } from '../config';
import { getAgentEnv } from '../services/streaming/envUtils';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { declineHostDialogs } from './hostDialogs';

/** A prompt that never yields: the session initializes and answers control calls, but no turn ever runs. */
const noPrompt: AsyncIterable<SDKUserMessage> = {
  [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>(() => {}) }),
};

/**
 * `getSettings()` exists on the SDK's query object but is missing from its
 * type declarations. `applied.effort` is the level a turn would send after
 * user settings, org caps, and the model's own default.
 */
interface SettingsReader {
  getSettings?: () => Promise<{ applied?: { effort?: unknown } }>;
}

/**
 * Ask Claude Code which models this account can use, what each alias
 * resolves to, and the effort each one starts at. No turn is sent, so this
 * costs nothing. User settings load because they can remap an alias (e.g.
 * `ANTHROPIC_DEFAULT_OPUS_MODEL`) or set a model's effort, and the list has
 * to agree with what chat will actually run.
 */
export async function listClaudeModels(): Promise<ClaudeSupportedModel[]> {
  const abortController = new AbortController();
  const session = query({
    prompt: noPrompt,
    options: {
      cwd: os.homedir(),
      settingSources: ['user'],
      persistSession: false,
      tools: [],
      onUserDialog: declineHostDialogs,
      ...getClaudeSdkSpawnOptions(),
      env: { ...getAgentEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
      abortController,
    },
  });
  // Aborting also ends the CLI process, so a hung init cannot outlive the timeout.
  const timer = setTimeout(() => abortController.abort(), getConfig().session.modelCatalogTimeoutMs);
  try {
    const models = await session.supportedModels();
    const reader = session as unknown as SettingsReader;
    const withDefaults: ClaudeSupportedModel[] = [];
    for (const model of models) {
      if (!reader.getSettings || !(CLAUDE_CHAT_MODEL_IDS as readonly string[]).includes(model.value)) {
        withDefaults.push(model);
        continue;
      }
      await session.setModel(model.value);
      const effort = (await reader.getSettings()).applied?.effort;
      withDefaults.push(typeof effort === 'string' ? { ...model, defaultEffort: effort } : model);
    }
    return withDefaults;
  } finally {
    clearTimeout(timer);
    abortController.abort();
  }
}
