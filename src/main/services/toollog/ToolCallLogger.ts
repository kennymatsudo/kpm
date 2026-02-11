/**
 * ToolCallLogger - Structured tool call logging for Claude sessions.
 *
 * Writes NDJSON to disk for offline analysis and broadcasts IPC events
 * to the renderer for real-time DevTools panel display.
 *
 * Follows the async-safe write pattern from PerfLogger.
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { ToolCallLogEntry, ToolCallTurnSummary, ActivityType } from '../../../shared/types';

/** Maximum entries to keep in memory per session */
const MAX_ENTRIES_PER_SESSION = 500;

export interface ToolCallLoggerDeps {
  getMainWindow: () => BrowserWindow | null;
}

export interface ToolCallLogger {
  logToolCall(entry: ToolCallLogEntry): void;
  finalizeTurn(projectId: string, chatSessionId: string): ToolCallTurnSummary | null;
  getCurrentTurnIndex(chatSessionId: string): number;
  getEntriesForSession(chatSessionId: string): ToolCallLogEntry[];
  getSessionStats(chatSessionId: string): {
    totalCalls: number;
    byCategory: Partial<Record<ActivityType, number>>;
    topFiles: string[];
    duplicateCount: number;
  };
  getInfo(): { enabled: boolean; logPath: string };
  setEnabled(enabled: boolean): void;
  clearSession(chatSessionId: string): void;
}

export function createToolCallLogger(deps: ToolCallLoggerDeps): ToolCallLogger {
  const entriesBySession = new Map<string, ToolCallLogEntry[]>();
  const turnIndex = new Map<string, number>();
  let writeChain: Promise<void> = Promise.resolve();
  let enabled = true;

  const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
  const tempDir = app.getPath('temp');
  const logPath = path.join(tempDir, `kpm-toollog-${sessionId}.ndjson`);

  function enqueueLine(entry: Record<string, unknown>): void {
    const line = `${JSON.stringify(entry)}\n`;
    writeChain = writeChain
      .then(() => fs.promises.appendFile(logPath, line))
      .catch((error) => {
        console.error('[ToolLog] Failed to write log:', error);
      });
  }

  function broadcast(channel: string, data: unknown): void {
    const mainWindow = deps.getMainWindow();
    mainWindow?.webContents.send(channel, data);
  }

  return {
    logToolCall(entry: ToolCallLogEntry): void {
      if (!enabled) return;

      // Store in memory
      let entries = entriesBySession.get(entry.chatSessionId);
      if (!entries) {
        entries = [];
        entriesBySession.set(entry.chatSessionId, entries);
      }

      // Evict oldest if at capacity
      if (entries.length >= MAX_ENTRIES_PER_SESSION) {
        entries.shift();
      }
      entries.push(entry);

      // Write NDJSON line
      enqueueLine({
        type: 'tool_call',
        ...entry,
      });

      // Broadcast to renderer
      broadcast('toollog:call', entry);
    },

    finalizeTurn(projectId: string, chatSessionId: string): ToolCallTurnSummary | null {
      if (!enabled) return null;

      const currentTurn = turnIndex.get(chatSessionId) ?? 0;
      const entries = entriesBySession.get(chatSessionId) ?? [];
      const turnEntries = entries.filter((e) => e.turnIndex === currentTurn);

      if (turnEntries.length === 0) {
        // Increment even with no calls so the next turn gets a fresh index
        turnIndex.set(chatSessionId, currentTurn + 1);
        return null;
      }

      // Compute category counts
      const byCategory: Partial<Record<ActivityType, number>> = {};
      for (const e of turnEntries) {
        byCategory[e.toolCategory] = (byCategory[e.toolCategory] ?? 0) + 1;
      }

      // Compute file path stats
      const allPaths = turnEntries.flatMap((e) => e.filePaths);
      const pathCounts = new Map<string, number>();
      for (const p of allPaths) {
        pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
      }
      const uniqueFilePaths = [...pathCounts.keys()];
      const duplicateReads = [...pathCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([filePath]) => filePath);

      const summary: ToolCallTurnSummary = {
        turnIndex: currentTurn,
        chatSessionId,
        totalCalls: turnEntries.length,
        byCategory,
        uniqueFilePaths,
        duplicateReads,
        startTime: turnEntries[0].timestamp,
        endTime: turnEntries[turnEntries.length - 1].timestamp,
      };

      // Write summary line
      enqueueLine({
        type: 'turn_summary',
        projectId,
        ...summary,
      });

      // Broadcast to renderer
      broadcast('toollog:turn-summary', summary);

      // Increment turn
      turnIndex.set(chatSessionId, currentTurn + 1);

      return summary;
    },

    getCurrentTurnIndex(chatSessionId: string): number {
      return turnIndex.get(chatSessionId) ?? 0;
    },

    getEntriesForSession(chatSessionId: string): ToolCallLogEntry[] {
      return entriesBySession.get(chatSessionId) ?? [];
    },

    getSessionStats(chatSessionId: string) {
      const entries = entriesBySession.get(chatSessionId) ?? [];

      const byCategory: Partial<Record<ActivityType, number>> = {};
      const fileCounts = new Map<string, number>();

      for (const e of entries) {
        byCategory[e.toolCategory] = (byCategory[e.toolCategory] ?? 0) + 1;
        for (const p of e.filePaths) {
          fileCounts.set(p, (fileCounts.get(p) ?? 0) + 1);
        }
      }

      // Top files by access count
      const topFiles = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([filePath]) => filePath);

      const duplicateCount = [...fileCounts.values()].filter((c) => c > 1).length;

      return {
        totalCalls: entries.length,
        byCategory,
        topFiles,
        duplicateCount,
      };
    },

    getInfo() {
      return { enabled, logPath };
    },

    setEnabled(value: boolean): void {
      enabled = value;
    },

    clearSession(chatSessionId: string): void {
      entriesBySession.delete(chatSessionId);
      turnIndex.delete(chatSessionId);
    },
  };
}
