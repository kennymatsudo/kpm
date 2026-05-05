import { describe, it, expect, beforeEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

// Hoisted mock state — must be declared before the vi.mock calls below.
const runClaudeQueryMock = vi.hoisted(() => vi.fn());

vi.mock('../../claude/runClaudeQuery', () => ({
  runClaudeQuery: runClaudeQueryMock,
}));

vi.mock('../../claude/findClaude', () => ({
  getClaudeSdkSpawnOptions: () => ({}),
}));

vi.mock('../../config', () => ({
  getConfig: () => ({
    generation: {
      fastModel: 'sonnet',
      deepModel: 'sonnet',
      cheapModel: 'haiku',
      briefingStageTimeoutMs: 60_000,
    },
  }),
}));

import { createBriefingService } from './BriefingService';
import { success } from '../result';

const PROJECT_ID = 'p-1';

function createTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status_category TEXT,
      item_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE plan_relations (
      from_item_id TEXT NOT NULL,
      to_item_id TEXT NOT NULL,
      relation_type TEXT NOT NULL
    );

    CREATE TABLE dev_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      plan_item_id TEXT NOT NULL,
      branch_name TEXT,
      status TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE project_briefings (
      project_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      stale_count INTEGER NOT NULL DEFAULT 0,
      ready_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

interface BuildOpts {
  withProject?: boolean;
  recordUsage?: boolean;
}

function buildService(db: Database, opts: BuildOpts = {}) {
  const recordUsage = opts.recordUsage ? vi.fn() : undefined;
  const service = createBriefingService({
    getDatabase: () => db,
    getPromptContent: () => 'test briefing instructions',
    fileExplorerService: {
      listDirectory: async () => success([]),
    },
    projects: {
      get: (id: string) =>
        opts.withProject !== false && id === PROJECT_ID
          ? { id, name: 'Test', folder_path: null }
          : undefined,
    },
    recordUsage,
  });
  return { service, recordUsage };
}

describe('BriefingService', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    runClaudeQueryMock.mockReset();
  });

  describe('generateBriefing', () => {
    it('returns failure when project not found', async () => {
      const { service } = buildService(db, { withProject: false });
      const result = await service.generateBriefing(PROJECT_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/not found/i);
    });

    it('skips chat synthesis when there are no messages, runs only Stage 2', async () => {
      runClaudeQueryMock.mockResolvedValueOnce({ text: '## Briefing\n\nNo work yet.', errors: [] });

      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID);

      expect(result.ok).toBe(true);
      // With zero chat messages, only Stage 2 should call the SDK.
      expect(runClaudeQueryMock).toHaveBeenCalledTimes(1);
      if (result.ok) {
        expect(result.data.summary).toContain('No work yet.');
      }
    });

    it('runs chat synthesis + Stage 2 when chat messages exist, feeding synthesis into the briefing', async () => {
      db.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`,
      ).run('m1', PROJECT_ID, 'user', 'I will fix the bug.');

      runClaudeQueryMock
        .mockResolvedValueOnce({ text: 'Chat synthesis output', errors: [] }) // Stage 1c
        .mockResolvedValueOnce({ text: 'Final briefing', errors: [] }); // Stage 2

      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.summary).toBe('Final briefing');
      expect(runClaudeQueryMock).toHaveBeenCalledTimes(2);
      const stage2Prompt = JSON.stringify(runClaudeQueryMock.mock.calls[1][0]);
      expect(stage2Prompt).toContain('Chat synthesis output');
    });

    it('streams Stage 2 chunks via onChunk callback', async () => {
      runClaudeQueryMock.mockImplementationOnce(async (opts: { onText?: (s: string) => void }) => {
        opts.onText?.('part 1 ');
        opts.onText?.('part 2');
        return { text: 'part 1 part 2', errors: [] };
      });

      const onChunk = vi.fn();
      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID, { onChunk });

      expect(result.ok).toBe(true);
      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'part 1 ');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'part 2');
    });

    it('records usage for each Claude call when recordUsage is provided', async () => {
      db.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`,
      ).run('m1', PROJECT_ID, 'user', 'msg');

      runClaudeQueryMock.mockImplementation(async (opts: {
        recordUsage?: (e: { usage: object; totalCostUsd?: number | null }) => void;
      }) => {
        opts.recordUsage?.({ usage: { input_tokens: 10 }, totalCostUsd: 0.01 });
        return { text: 'out', errors: [] };
      });

      const { service, recordUsage } = buildService(db, { recordUsage: true });
      await service.generateBriefing(PROJECT_ID);

      expect(recordUsage).toHaveBeenCalledTimes(2);
      expect(recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: PROJECT_ID, model: 'sonnet' }),
      );
    });

    it('persists briefing with signal counts derived from plan items', async () => {
      db.prepare(
        `INSERT INTO plan_items (id, project_id, title, status_category) VALUES (?, ?, ?, ?)`,
      ).run('pi-1', PROJECT_ID, 'blocked one', 'blocked');
      db.prepare(
        `INSERT INTO plan_items (id, project_id, title, status_category) VALUES (?, ?, ?, ?)`,
      ).run('pi-2', PROJECT_ID, 'ready one', 'not_started');

      runClaudeQueryMock.mockResolvedValueOnce({ text: 'summary', errors: [] });

      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.signalCounts.blockedCount).toBe(1);
      expect(result.data.signalCounts.readyCount).toBe(1);

      const persisted = db.prepare(`SELECT * FROM project_briefings WHERE project_id = ?`).get(PROJECT_ID) as {
        summary: string;
        blocked_count: number;
        ready_count: number;
      } | undefined;
      expect(persisted?.summary).toBe('summary');
      expect(persisted?.blocked_count).toBe(1);
      expect(persisted?.ready_count).toBe(1);
    });
  });

  describe('getBriefing', () => {
    it('returns null when no briefing has been generated', () => {
      const { service } = buildService(db);
      expect(service.getBriefing(PROJECT_ID)).toBeNull();
    });

    it('returns the persisted row when no plan changes have occurred since generation', () => {
      db.prepare(
        `INSERT INTO project_briefings (project_id, summary, generated_at, blocked_count, stale_count, ready_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(PROJECT_ID, 'cached summary', '2999-01-01T00:00:00.000Z', 1, 2, 3);

      const { service } = buildService(db);
      const result = service.getBriefing(PROJECT_ID);
      expect(result).not.toBeNull();
      expect(result?.summary).toBe('cached summary');
      expect(result?.signalCounts).toEqual({ blockedCount: 1, staleCount: 2, readyCount: 3 });
    });

    it('treats the cached row as stale when a plan item was updated after generation', () => {
      db.prepare(
        `INSERT INTO project_briefings (project_id, summary, generated_at, blocked_count, stale_count, ready_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(PROJECT_ID, 'cached', '2020-01-01T00:00:00.000Z', 0, 0, 0);

      // Plan item updated_at is "now" (well after 2020).
      db.prepare(
        `INSERT INTO plan_items (id, project_id, title, status_category) VALUES (?, ?, ?, ?)`,
      ).run('pi-new', PROJECT_ID, 'fresh', 'in_progress');

      const { service } = buildService(db);
      expect(service.getBriefing(PROJECT_ID)).toBeNull();
    });
  });
});
