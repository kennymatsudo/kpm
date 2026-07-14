import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb } from '../../db/testing/createTestDb';

// Hoisted mock state — must be declared before the vi.mock calls below.
// BriefingService drives the provider-neutral generation seam; the test mocks
// that seam, not any provider SDK.
const runGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('../../generation', () => ({
  runGeneration: runGenerationMock,
}));

vi.mock('../../config', () => ({
  getConfig: () => ({
    generation: {
      briefingStageTimeoutMs: 60_000,
    },
  }),
}));

import { createBriefingService } from './BriefingService';
import { success } from '../result';

const PROJECT_ID = 'p-1';

function seedProject(db: Database): void {
  db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)`).run(
    PROJECT_ID,
    'Test Project',
    '/tmp/test-project'
  );
}

interface BuildOpts {
  withProject?: boolean;
}

function buildService(db: Database, opts: BuildOpts = {}) {
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
  });
  return { service };
}

describe('BriefingService', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    runGenerationMock.mockReset();
  });

  describe('generateBriefing', () => {
    it('returns failure when project not found', async () => {
      const { service } = buildService(db, { withProject: false });
      const result = await service.generateBriefing(PROJECT_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/not found/i);
    });

    it('skips chat synthesis when there are no messages, runs only Stage 2', async () => {
      runGenerationMock.mockResolvedValueOnce({ text: '## Briefing\n\nNo work yet.', errors: [] });

      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID);

      expect(result.ok).toBe(true);
      // With zero chat messages, only Stage 2 should call the SDK.
      expect(runGenerationMock).toHaveBeenCalledTimes(1);
      if (result.ok) {
        expect(result.data.summary).toContain('No work yet.');
      }
    });

    it('runs chat synthesis + Stage 2 when chat messages exist, feeding synthesis into the briefing', async () => {
      db.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`,
      ).run('m1', PROJECT_ID, 'user', 'I will fix the bug.');

      runGenerationMock
        .mockResolvedValueOnce({ text: 'Chat synthesis output', errors: [] }) // Stage 1c
        .mockResolvedValueOnce({ text: 'Final briefing', errors: [] }); // Stage 2

      const { service } = buildService(db);
      const result = await service.generateBriefing(PROJECT_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.summary).toBe('Final briefing');
      expect(runGenerationMock).toHaveBeenCalledTimes(2);
      const stage2Prompt = JSON.stringify(runGenerationMock.mock.calls[1][0]);
      expect(stage2Prompt).toContain('Chat synthesis output');
    });

    it('streams Stage 2 chunks via onChunk callback', async () => {
      runGenerationMock.mockImplementationOnce(async (opts: { onText?: (s: string) => void }) => {
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

    it('persists briefing with signal counts derived from plan items', async () => {
      db.prepare(
        `INSERT INTO plan_items (id, project_id, title, status_category, item_order) VALUES (?, ?, ?, ?, ?)`,
      ).run('pi-1', PROJECT_ID, 'blocked one', 'blocked', 0);
      db.prepare(
        `INSERT INTO plan_items (id, project_id, title, status_category, item_order) VALUES (?, ?, ?, ?, ?)`,
      ).run('pi-2', PROJECT_ID, 'ready one', 'not_started', 1);

      runGenerationMock.mockResolvedValueOnce({ text: 'summary', errors: [] });

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
        `INSERT INTO plan_items (id, project_id, title, status_category, item_order) VALUES (?, ?, ?, ?, ?)`,
      ).run('pi-new', PROJECT_ID, 'fresh', 'in_progress', 0);

      const { service } = buildService(db);
      expect(service.getBriefing(PROJECT_ID)).toBeNull();
    });
  });
});
