import type { ChatProvider } from './appSettings';
import { PI_UNRESOLVED_MODEL_ID, type ClaudeModel, type CodexChatModel } from './types';

/**
 * The provider+model the user has chosen in KPM, expressed as an agent-execution
 * pair. A playbook candidate marked `useDefault` follows this pair; board
 * execution then reconciles it against the providers it can actually run, so a
 * pair naming an unrunnable provider (e.g. `pi`) is skipped and the candidate
 * falls through to the next entry in its chain.
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
      return { provider: 'pi', model: piModelId(inputs.piProviderModel) };
    case 'claude':
    default:
      return { provider: 'claude', model: inputs.claudeModel };
  }
}

/** A pi selector is `"<provider>/<modelId>"`; take the model half, or `auto`. */
function piModelId(selector: string | null): string {
  if (!selector) return PI_UNRESOLVED_MODEL_ID;
  const slash = selector.indexOf('/');
  return slash >= 0 ? selector.slice(slash + 1) : selector;
}
