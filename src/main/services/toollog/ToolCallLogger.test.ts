import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolCallLogEntry } from '../../../shared/types';

// Mock electron modules before importing
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
  },
}));

vi.mock('fs', () => ({
  default: {
    promises: {
      appendFile: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { createToolCallLogger } from './ToolCallLogger';

function makeEntry(overrides: Partial<ToolCallLogEntry> = {}): ToolCallLogEntry {
  return {
    id: 'entry-1',
    projectId: 'proj-1',
    chatSessionId: 'session-1',
    turnIndex: 0,
    toolName: 'Read',
    toolCategory: 'read',
    input: { file_path: '/foo/bar.ts' },
    filePaths: ['/foo/bar.ts'],
    label: 'bar.ts',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ToolCallLogger', () => {
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMock = vi.fn();
  });

  function createLogger() {
    return createToolCallLogger({
      getMainWindow: () => ({
        webContents: { send: sendMock },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
  }

  it('logs a tool call and broadcasts', () => {
    const logger = createLogger();
    const entry = makeEntry();

    logger.logToolCall(entry);

    expect(sendMock).toHaveBeenCalledWith('toollog:call', entry);
    expect(logger.getEntriesForSession('session-1')).toHaveLength(1);
  });

  it('tracks turn index per session', () => {
    const logger = createLogger();

    expect(logger.getCurrentTurnIndex('session-1')).toBe(0);

    logger.logToolCall(makeEntry());
    logger.finalizeTurn('proj-1', 'session-1');

    expect(logger.getCurrentTurnIndex('session-1')).toBe(1);
  });

  it('produces turn summary with correct counts', () => {
    const logger = createLogger();

    logger.logToolCall(makeEntry({ id: '1', toolCategory: 'read' }));
    logger.logToolCall(makeEntry({ id: '2', toolCategory: 'search' }));
    logger.logToolCall(makeEntry({ id: '3', toolCategory: 'read' }));

    const summary = logger.finalizeTurn('proj-1', 'session-1');

    expect(summary).not.toBeNull();
    expect(summary!.totalCalls).toBe(3);
    expect(summary!.byCategory.read).toBe(2);
    expect(summary!.byCategory.search).toBe(1);
  });

  it('detects duplicate file reads', () => {
    const logger = createLogger();

    logger.logToolCall(makeEntry({ id: '1', filePaths: ['/foo/bar.ts'] }));
    logger.logToolCall(makeEntry({ id: '2', filePaths: ['/foo/bar.ts'] }));
    logger.logToolCall(makeEntry({ id: '3', filePaths: ['/other.ts'] }));

    const summary = logger.finalizeTurn('proj-1', 'session-1');

    expect(summary!.duplicateReads).toEqual(['/foo/bar.ts']);
    expect(summary!.uniqueFilePaths).toHaveLength(2);
  });

  it('returns null summary for turn with no entries', () => {
    const logger = createLogger();

    const summary = logger.finalizeTurn('proj-1', 'session-1');

    expect(summary).toBeNull();
    // Turn should still increment
    expect(logger.getCurrentTurnIndex('session-1')).toBe(1);
  });

  it('does not log when disabled', () => {
    const logger = createLogger();
    logger.setEnabled(false);

    logger.logToolCall(makeEntry());

    expect(sendMock).not.toHaveBeenCalled();
    expect(logger.getEntriesForSession('session-1')).toHaveLength(0);
  });

  it('clears session data', () => {
    const logger = createLogger();
    logger.logToolCall(makeEntry());
    logger.finalizeTurn('proj-1', 'session-1');

    logger.clearSession('session-1');

    expect(logger.getEntriesForSession('session-1')).toHaveLength(0);
    expect(logger.getCurrentTurnIndex('session-1')).toBe(0);
  });

  it('caps in-memory entries at 500', () => {
    const logger = createLogger();

    for (let i = 0; i < 510; i++) {
      logger.logToolCall(makeEntry({ id: `entry-${i}` }));
    }

    expect(logger.getEntriesForSession('session-1')).toHaveLength(500);
  });

  it('computes session stats', () => {
    const logger = createLogger();

    logger.logToolCall(makeEntry({ id: '1', toolCategory: 'read', filePaths: ['/a.ts'] }));
    logger.logToolCall(makeEntry({ id: '2', toolCategory: 'read', filePaths: ['/a.ts'] }));
    logger.logToolCall(makeEntry({ id: '3', toolCategory: 'edit', filePaths: ['/b.ts'] }));

    const stats = logger.getSessionStats('session-1');

    expect(stats.totalCalls).toBe(3);
    expect(stats.byCategory.read).toBe(2);
    expect(stats.byCategory.edit).toBe(1);
    expect(stats.topFiles).toContain('/a.ts');
    expect(stats.duplicateCount).toBe(1);
  });

  it('reports info with enabled status and log path', () => {
    const logger = createLogger();

    const info = logger.getInfo();

    expect(info.enabled).toBe(true);
    expect(info.logPath).toMatch(/kpm-toollog-.*\.ndjson$/);
  });
});
