import type { ChatProvider } from './appSettings';
import { PI_UNRESOLVED_MODEL_ID, type ClaudeModel, type CodexChatModel } from './types';

/**
 * The provider+model the user has chosen in KPM, expressed as an agent-execution
 * pair. A playbook candidate marked `useDefault` follows this pair; board
 * execution then reconciles it against the providers and models available to
 * the board, falling through to the next candidate when it cannot resolve.
 */
export interface DefaultModel {
  provider: string;
  model: string;
}

/** The user-chosen settings a {@link DefaultModel} is derived from. */
export interface DefaultModelInputs {
  provider: ChatProvider;
  claudeModel: ClaudeModel;
  codexModel: CodexChatModel;
  piProviderModel: string | null;
}

export function resolveDefaultModel(inputs: DefaultModelInputs): DefaultModel {
  switch (inputs.provider) {
    case 'codex':
      return { provider: 'codex', model: inputs.codexModel };
    case 'pi':
      return { provider: 'pi', model: inputs.piProviderModel ?? PI_UNRESOLVED_MODEL_ID };
    case 'claude':
    default:
      return { provider: 'claude', model: inputs.claudeModel };
  }
}
