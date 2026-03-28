import type { ToolCallLogEntry, ToolCallTurnSummary } from '../../shared/types';

export function setToolLogEnabled(enabled: boolean) {
  return window.api.toolLog.setEnabled(enabled);
}

export function subscribeToToolLogEvents(handlers: {
  onCall?: (entry: ToolCallLogEntry) => void;
  onTurnSummary?: (summary: ToolCallTurnSummary) => void;
}): () => void {
  const cleanups = [
    handlers.onCall ? window.api.toolLog.onCall(handlers.onCall) : null,
    handlers.onTurnSummary ? window.api.toolLog.onTurnSummary(handlers.onTurnSummary) : null,
  ].filter((cleanup): cleanup is (() => void) => Boolean(cleanup));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
