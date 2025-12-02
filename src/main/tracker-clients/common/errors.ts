export type TrackerErrorCode =
  | 'UNAUTHORIZED'      // 401 - bad credentials
  | 'FORBIDDEN'         // 403 - no access to resource
  | 'NOT_FOUND'         // 404 - project/issue doesn't exist
  | 'RATE_LIMITED'      // 429 - too many requests
  | 'SERVER_ERROR'      // 5xx - Jira is down
  | 'NETWORK_ERROR'     // fetch failed
  | 'UNKNOWN';

export class TrackerError extends Error {
  constructor(
    public code: TrackerErrorCode,
    public userMessage: string,
    public cause?: Error
  ) {
    super(userMessage);
    this.name = 'TrackerError';
  }

  static fromJiraError(error: unknown): TrackerError {
    // jira.js throws HttpException with status code

      switch (status) {
        case 400: return new TrackerError('UNKNOWN', message || 'Bad request - check your query syntax.');
        case 401: return new TrackerError('UNAUTHORIZED', 'Invalid credentials. Check your email and API token.');
        case 403: return new TrackerError('FORBIDDEN', 'Access denied. Check your Jira permissions.');
        case 404: return new TrackerError('NOT_FOUND', message || 'Resource not found.');
        case 410: return new TrackerError('UNKNOWN', message || 'API endpoint no longer available. The Jira API may have changed.');
        case 429: return new TrackerError('RATE_LIMITED', 'Too many requests. Please wait and try again.');
        default:
          if (status >= 500) return new TrackerError('SERVER_ERROR', 'Jira is experiencing issues. Try again later.');
          if (message) return new TrackerError('UNKNOWN', message);
      }
    }
    if (error instanceof Error && error.message.includes('fetch')) {
      return new TrackerError('NETWORK_ERROR', 'Cannot connect to Jira. Check your network connection.');
    }
    // Include the actual error message for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new TrackerError('UNKNOWN', `Error: ${errorMessage}`);
  }
}
