/**
 * Error classification for Codex SDK errors.
 *
 * Translates Codex errors into user-friendly messages and typed error categories.
 * Mirrors the pattern from claude/errors.ts but without Claude SDK dependencies.
 */

export type CodexErrorType = 'rate_limit' | 'auth' | 'network' | 'timeout' | 'cancelled' | 'unknown';

export interface ClassifiedCodexError {
  message: string;
  type: CodexErrorType;
}

function isRateLimitError(message: string): boolean {
  return (
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  );
}

function isAuthenticationError(message: string): boolean {
  return (
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('authentication') ||
    message.includes('api key') ||
    message.includes('invalid_api_key') ||
    message.includes('invalid api key')
  );
}

function isNetworkError(message: string): boolean {
  return (
    message.includes('network') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('connection') ||
    message.includes('fetch failed')
  );
}

function isTimeoutError(message: string): boolean {
  return (
    message.includes('timeout') ||
    message.includes('etimedout') ||
    message.includes('timed out')
  );
}

/**
 * Classify an error into a user-friendly type with appropriate message.
 */
export function classifyCodexError(error: unknown): ClassifiedCodexError {
  if (error instanceof Error) {
    // Check for abort/cancellation
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return { message: 'Request was cancelled', type: 'cancelled' };
    }

    const message = error.message.toLowerCase();

    if (isRateLimitError(message)) {
      return {
        message: 'Rate limited. Please try again in a moment.',
        type: 'rate_limit',
      };
    }

    if (isAuthenticationError(message)) {
      return {
        message: 'Authentication failed. Please check your OpenAI API key.',
        type: 'auth',
      };
    }

    if (isNetworkError(message)) {
      return {
        message: 'Network error. Please check your internet connection.',
        type: 'network',
      };
    }

    if (isTimeoutError(message)) {
      return {
        message: 'Request timed out. The operation took too long.',
        type: 'timeout',
      };
    }

    return { message: error.message, type: 'unknown' };
  }

  return { message: 'An unknown error occurred', type: 'unknown' };
}
