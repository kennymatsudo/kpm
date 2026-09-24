import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { ExternalPlanItemRepository } from './ExternalPlanItemRepository';
import { PlanItemRepository } from './PlanItemRepository';

function seedProject(db: Database, id = 'project-1'): void {
  db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)`).run(
    id,
    `Project ${id}`,
    `/tmp/${id}`
  );
}

function rawRow(db: Database, id: string): Record<string, unknown> {
  return db.prepare('SELECT * FROM plan_items WHERE id = ?').get(id) as Record<string, unknown>;
}

function externalIssue(overrides: Record<string, unknown> = {}) {
  return {
    project_id: 'project-1',
    association_id: 'assoc-1',
    title: 'Imported issue',
    description: 'Body text',
    label: 'story',
    external_key: 'ENG-1',
    external_id: 'issue-1',
    external_type: 'linear',
    external_issue_type: 'Issue',
    external_status: 'In Progress',
    status_category: 'in_progress',
    external_url: 'https://linear.app/example/issue/ENG-1',
    external_parent_key: 'ENG-0',
    external_epic_key: 'EPIC-9',
    external_assignee_id: 'user-a',
    external_assignee_name: 'Ada',
    external_assignee_avatar_url: 'https://example.com/ada.png',
    external_creator_id: 'user-b',
    external_creator_name: 'Bob',
    external_creator_avatar_url: 'https://example.com/bob.png',
    ...overrides,
  };
}

describe('ExternalPlanItemRepository', () => {
  let db: Database;
  let repo: ExternalPlanItemRepository;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    repo = new ExternalPlanItemRepository(db, new PlanItemRepository(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('createFromExternal', () => {
    it('writes every external column and the tracker-owned defaults', () => {
      const created = repo.createFromExternal(externalIssue());
      const row = rawRow(db, created.id);

      expect(row).toMatchObject({
        project_id: 'project-1',
        parent_id: null,
        title: 'Imported issue',
        description: 'Body text',
        label: 'story',
        item_order: 0,
        status: 'planned',
        status_category: 'in_progress',
        external_key: 'ENG-1',
        external_id: 'issue-1',
        external_type: 'linear',
        external_issue_type: 'Issue',
        external_status: 'In Progress',
        external_url: 'https://linear.app/example/issue/ENG-1',
        external_parent_key: 'ENG-0',
        external_epic_key: 'EPIC-9',
        external_assignee_id: 'user-a',
        external_assignee_name: 'Ada',
        external_assignee_avatar_url: 'https://example.com/ada.png',
        external_creator_id: 'user-b',
        external_creator_name: 'Bob',
        external_creator_avatar_url: 'https://example.com/bob.png',
        sync_source: 'linear',
        association_id: 'assoc-1',
      });
      expect(row.last_synced_at).toEqual(expect.any(String));
    });

    it('returns the inserted row without a second read', () => {
      const created = repo.createFromExternal(externalIssue());

      expect(created.external_key).toBe('ENG-1');
      expect(created.sync_source).toBe('linear');
      expect(created.code_refs).toBeNull();
    });

    it('stores null for the optional external id and url', () => {
      const created = repo.createFromExternal(
        externalIssue({ external_id: undefined, external_url: undefined })
      );
      const row = rawRow(db, created.id);

      expect(row.external_id).toBeNull();
      expect(row.external_url).toBeNull();
    });

    it('appends after the project\'s existing root items', () => {
      repo.createFromExternal(externalIssue({ external_key: 'ENG-1' }));
      const second = repo.createFromExternal(externalIssue({ external_key: 'ENG-2' }));

      expect(rawRow(db, second.id).item_order).toBe(1);
    });
  });

  describe('importExternalIssues', () => {
    it('inserts a batch in order and returns the created items in insertion order', () => {
      const created = repo.importExternalIssues([
        externalIssue({ external_key: 'ENG-1', title: 'First' }),
        externalIssue({ external_key: 'ENG-2', title: 'Second' }),
        externalIssue({ external_key: 'ENG-3', title: 'Third' }),
      ]);

      expect(created.map((item) => item.title)).toEqual(['First', 'Second', 'Third']);
      expect(created.map((item) => item.item_order)).toEqual([0, 1, 2]);
      expect(created.every((item) => item.sync_source === 'linear')).toBe(true);
      expect(rawRow(db, created[0].id).last_synced_at).toEqual(expect.any(String));
    });

    it('skips issues already linked in the project', () => {
      repo.createFromExternal(externalIssue({ external_key: 'ENG-1' }));

      const created = repo.importExternalIssues([
        externalIssue({ external_key: 'ENG-1', title: 'Duplicate' }),
        externalIssue({ external_key: 'ENG-2', title: 'New' }),
      ]);

      expect(created.map((item) => item.title)).toEqual(['New']);
      expect(created[0].item_order).toBe(1);
    });

    it('skips a key repeated inside the same batch', () => {
      const created = repo.importExternalIssues([
        externalIssue({ external_key: 'ENG-1', title: 'First' }),
        externalIssue({ external_key: 'ENG-1', title: 'Repeat' }),
      ]);

      expect(created.map((item) => item.title)).toEqual(['First']);
    });

    it('numbers item_order per project', () => {
      seedProject(db, 'project-2');

      const created = repo.importExternalIssues([
        externalIssue({ external_key: 'ENG-1' }),
        externalIssue({ external_key: 'ENG-2', project_id: 'project-2' }),
        externalIssue({ external_key: 'ENG-3' }),
      ]);

      const byKey = new Map(created.map((item) => [item.external_key, item]));
      expect(byKey.get('ENG-1')?.item_order).toBe(0);
      expect(byKey.get('ENG-3')?.item_order).toBe(1);
      expect(byKey.get('ENG-2')?.item_order).toBe(0);
    });

    it('returns nothing for an empty batch', () => {
      expect(repo.importExternalIssues([])).toEqual([]);
    });
  });

  describe('updateFromExternal', () => {
    it('clears completed_at when the tracker moves an item off done', () => {
      const created = repo.createFromExternal(externalIssue({ status_category: 'in_progress' }));
      repo.updateFromExternal(created.id, { status_category: 'done' });
      expect(rawRow(db, created.id).completed_at).not.toBeNull();

      repo.updateFromExternal(created.id, { status_category: 'in_review', external_status: 'In Review' });

      expect(rawRow(db, created.id)).toMatchObject({ status_category: 'in_review', completed_at: null });
    });
  });

  describe('unlinkFromExternal', () => {
    it('clears the tracker identity and leaves the plan item itself intact', () => {
      const created = repo.createFromExternal(externalIssue());

      repo.unlinkFromExternal(created.id);
      const row = rawRow(db, created.id);

      expect(row).toMatchObject({
        external_key: null,
        external_id: null,
        external_type: null,
        external_issue_type: null,
        external_status: null,
        external_url: null,
        external_parent_key: null,
        external_epic_key: null,
        external_assignee_id: null,
        external_assignee_name: null,
        external_assignee_avatar_url: null,
        external_creator_id: null,
        external_creator_name: null,
        external_creator_avatar_url: null,
        sync_source: 'local',
        last_synced_at: null,
        association_id: null,
      });
      expect(row).toMatchObject({
        title: 'Imported issue',
        description: 'Body text',
        label: 'story',
        item_order: 0,
        status: 'planned',
        status_category: 'in_progress',
      });
    });
  });
});
