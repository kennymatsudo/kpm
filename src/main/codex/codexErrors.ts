import { describeProviderFailure } from '../services/streaming/providerChatMessage';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const RETRY = 'Wait a moment, then send another message to retry.';

/**
 * Guidance per app-server `CodexErrorInfo` code. Unit variants arrive as a
 * string; the HTTP ones as a single-key object, so both reduce to the key.
 */
const GUIDANCE: Record<string, string> = {
  unauthorized: 'Codex is not signed in. Run codex login in a terminal, then send another message.',
  usageLimitExceeded: 'Codex usage limit reached. Wait for it to reset or check your plan, then send another message.',
  sessionBudgetExceeded: 'This Codex session reached its budget limit.',
  rateLimitExceeded: `Codex is rate limited. ${RETRY}`,
  serverOverloaded: `Codex is overloaded. ${RETRY}`,
  internalServerError: `Codex had a server error. ${RETRY}`,
  contextWindowExceeded: 'This chat is too long for Codex to continue. Start a new chat.',
  httpConnectionFailed: 'Codex could not reach its servers. Check your connection, then send another message.',
  responseStreamConnectionFailed: 'Codex could not reach its servers. Check your connection, then send another message.',
  responseStreamDisconnected: `Codex lost its connection mid-response. ${RETRY}`,
  responseTooManyFailedAttempts: `Codex gave up after repeated failed attempts. ${RETRY}`,
  cyberPolicy: 'Codex declined this request.',
  misalignmentPolicyViolation: 'Codex declined this request.',
  badRequest: 'Codex rejected the request.',
  sandboxError: 'Codex could not run a command in its sandbox.',
};

function errorCode(info: unknown): string | undefined {
  if (typeof info === 'string') return info;
  if (isObject(info)) return Object.keys(info)[0];
  return undefined;
}

/** Banner text for an app-server `TurnError` (`{ message, codexErrorInfo, misalignment, ... }`). */
export function describeCodexTurnError(error: unknown): string {
  const turnError = isObject(error) ? error : {};
  const code = errorCode(turnError.codexErrorInfo);
  const guidance = (code && GUIDANCE[code]) ?? `Codex stopped with an error. ${RETRY}`;
  // A policy block carries its own explanation, which says more than the generic message.
  const misalignment = isObject(turnError.misalignment) ? turnError.misalignment : {};
  const explanation = typeof misalignment.detailedExplanation === 'string' ? misalignment.detailedExplanation : '';
  const message = typeof turnError.message === 'string' ? turnError.message : typeof error === 'string' ? error : '';
  return describeProviderFailure(guidance, explanation || message);
}
