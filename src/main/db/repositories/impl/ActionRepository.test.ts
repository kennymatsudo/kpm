import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { ActionRepository } from './ActionRepository';
import { ActionRunRepository } from './ActionRunRepository';
import type { ActionCreate } from '../../interfaces';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function seedProject(db: ReturnType<typeof createTestDb>): void {
  db.prepare('INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)')
    .run(PROJECT_ID, 'Test project', '/tmp/test-project');
}

const manual: ActionCreate = {
  name: 'Test plan',
  description: 'Draft a test plan',
  projectId: null,
  prompt: 'Write a test plan.',
  icon: 'clipboard',
  keywords: 'test,plan',
  trigger: { kind: 'manual' },
  enabled: true,
  capabilities: ['read_project', 'write_outputs'],
  manualRun: 'headless',
  targetType: 'none',
  model: null,
};

describe('ActionRepository', () => {
  it('round-trips a manual global action', () => {
    const db = createTestDb();
    try {
      const repo = new ActionRepository(db);
      const created = repo.create(manual);
      expect(created).toMatchObject({
        name: 'Test plan',
        projectId: null,
        trigger: { kind: 'manual' },
        capabilities: ['read_project', 'write_outputs'],
        manualRun: 'headless',
      });
      expect(repo.get(created.id)).toMatchObject({ id: created.id, name: 'Test plan' });
    } finally {
      db.close();
    }
  });

  it('round-trips each trigger kind through its columns', () => {
    const db = createTestDb();
    try {
      seedProject(db);
      const repo = new ActionRepository(db);
      const interval = repo.create({
        ...manual,
        name: 'Interval',
        projectId: PROJECT_ID,
        trigger: { kind: 'interval', minutes: 240 },
      });
      const event = repo.create({
        ...manual,
        name: 'Event',
        projectId: PROJECT_ID,
        trigger: { kind: 'event', event: 'board_agent_finished' },
      });
      expect(interval.trigger).toEqual({ kind: 'interval', minutes: 240 });
      expect(event.trigger).toEqual({ kind: 'event', event: 'board_agent_finished' });
    } finally {
      db.close();
    }
  });

  it('lists a project\'s own actions alongside global ones', () => {
    const db = createTestDb();
    try {
      seedProject(db);
      const repo = new ActionRepository(db);
      repo.create({ ...manual, name: 'Global' });
      repo.create({ ...manual, name: 'Scoped', projectId: PROJECT_ID });
      repo.create({ ...manual, name: 'Other project', projectId: null });

      const names = repo.listForProject(PROJECT_ID).map((action) => action.name);
      expect(names).toHaveLength(3);
      expect(names).toContain('Global');
      expect(names).toContain('Scoped');
    } finally {
      db.close();
    }
  });

  it('selects only enabled automatic actions for the scheduler', () => {
    const db = createTestDb();
    try {
      seedProject(db);
      const repo = new ActionRepository(db);
      repo.create({ ...manual, name: 'Manual one' });
      repo.create({
        ...manual,
        name: 'Enabled interval',
        projectId: PROJECT_ID,
        trigger: { kind: 'interval', minutes: 60 },
      });
      repo.create({
        ...manual,
        name: 'Disabled interval',
        projectId: PROJECT_ID,
        enabled: false,
        trigger: { kind: 'interval', minutes: 60 },
      });
      repo.create({
        ...manual,
        name: 'Event listener',
        projectId: PROJECT_ID,
        trigger: { kind: 'event', event: 'pr_changed' },
      });

      expect(repo.listEnabledIntervalTriggered().map((a) => a.name)).toEqual(['Enabled interval']);
      expect(repo.listEnabledForEvent('pr_changed').map((a) => a.name)).toEqual(['Event listener']);
      expect(repo.listEnabledForEvent('app_opened')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('scopes name collisions and ignores the row being edited', () => {
    const db = createTestDb();
    try {
      seedProject(db);
      const repo = new ActionRepository(db);
      const global = repo.create({ ...manual, name: 'Digest' });
      repo.create({ ...manual, name: 'Digest', projectId: PROJECT_ID });

      expect(repo.nameExists(null, 'Digest')).toBe(true);
      expect(repo.nameExists(PROJECT_ID, 'Digest')).toBe(true);
      expect(repo.nameExists(null, 'Nothing')).toBe(false);
      expect(repo.nameExists(null, 'Digest', global.id)).toBe(false);
    } finally {
      db.close();
    }
  });

  it('updates a trigger and clears the columns the new kind does not use', () => {
    const db = createTestDb();
    try {
      seedProject(db);
      const repo = new ActionRepository(db);
      const created = repo.create({
        ...manual,
        projectId: PROJECT_ID,
        trigger: { kind: 'interval', minutes: 60 },
      });

      const toEvent = repo.update(created.id, { trigger: { kind: 'event', event: 'app_opened' } });
      expect(toEvent?.trigger).toEqual({ kind: 'event', event: 'app_opened' });

      const toManual = repo.update(created.id, { trigger: { kind: 'manual' } });
      expect(toManual?.trigger).toEqual({ kind: 'manual' });
    } finally {
      db.close();
    }
  });

  it('persists capability grants and drops unrecognized ones on read', () => {
    const db = createTestDb();
    try {
      const repo = new ActionRepository(db);
      const created = repo.create({ ...manual, capabilities: ['read_project', 'report_finding'] });
      expect(repo.get(created.id)?.capabilities).toEqual(['read_project', 'report_finding']);

      db.prepare('UPDATE actions SET capabilities = ? WHERE id = ?')
        .run('["read_project","not_a_capability"]', created.id);
      expect(repo.get(created.id)?.capabilities).toEqual(['read_project']);

      db.prepare('UPDATE actions SET capabilities = ? WHERE id = ?').run('not json', created.id);
      expect(repo.get(created.id)?.capabilities).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('records run outcome and memory', () => {
    const db = createTestDb();
    try {
      const repo = new ActionRepository(db);
      const created = repo.create(manual);
      repo.recordRunOutcome(created.id, 'error', 'boom', '2026-07-24T00:00:00.000Z');
      repo.updateMemory(created.id, 'seen commit abc123');

      expect(repo.get(created.id)).toMatchObject({
        lastOutcome: 'error',
        lastError: 'boom',
        lastRunAt: '2026-07-24T00:00:00.000Z',
        memory: 'seen commit abc123',
      });
    } finally {
      db.close();
    }
  });
});

describe('ActionRunRepository', () => {
  it('lists newest first and prunes to a bounded window', () => {
    const db = createTestDb();
    try {
      const actions = new ActionRepository(db);
      const runs = new ActionRunRepository(db);
      const action = actions.create(manual);

      for (let index = 0; index < 5; index += 1) {
        runs.create({
          actionId: action.id,
          outcome: 'ok',
          summary: `run ${index}`,
          startedAt: `2026-07-2${index}T00:00:00.000Z`,
        });
      }

      expect(runs.listByAction(action.id).map((run) => run.summary)).toEqual([
        'run 4', 'run 3', 'run 2', 'run 1', 'run 0',
      ]);
      expect(runs.listByAction(action.id, 2)).toHaveLength(2);

      runs.pruneOld(action.id, 2);
      expect(runs.listByAction(action.id).map((run) => run.summary)).toEqual(['run 4', 'run 3']);
    } finally {
      db.close();
    }
  });
});
