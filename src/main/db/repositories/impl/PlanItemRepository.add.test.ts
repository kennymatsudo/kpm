import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../migrations';
import { PlanItemRepository } from './PlanItemRepository';

function seedProject(db: Database): void {
  db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)`).run(
    'project-1',
    'Test Project',
    '/tmp/test-project'
  );
}

describe('PlanItemRepository.add (registry-generated INSERT)', () => {
  let db: Database;
  let repo: PlanItemRepository;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    seedProject(db);
    repo = new PlanItemRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips every registry field plus external fields through add() and get()', () => {
    repo.add({
      id: 'item-1',
      project_id: 'project-1',
      title: 'Full item',
      item_order: 0,
      description: 'A description',
      intent: 'The decided outcome',
      acceptance_criteria: ['Criterion A', 'Criterion B'],
      source_document_id: 'doc-1',
      label: 'story',
      release_tag: 'v1.0',
      status: 'planned',
      status_category: 'in_progress',
      parent_id: null,
      code_refs: ['src/a.ts', 'src/b.ts'],
      position_x: 10,
      position_y: 20,
      group_id: 'group-1',
      external_key: 'PROJ-123',
      external_type: 'jira',
      sync_source: 'jira',
    });

    const row = repo.get('item-1');
    expect(row?.title).toBe('Full item');
    expect(row?.description).toBe('A description');
    expect(row?.intent).toBe('The decided outcome');
    expect(row?.acceptance_criteria).toEqual(['Criterion A', 'Criterion B']);
    expect(row?.source_document_id).toBe('doc-1');
    expect(row?.label).toBe('story');
    expect(row?.release_tag).toBe('v1.0');
    expect(row?.status).toBe('planned');
    expect(row?.status_category).toBe('in_progress');
    expect(row?.code_refs).toEqual(['src/a.ts', 'src/b.ts']);
    expect(row?.position_x).toBe(10);
    expect(row?.position_y).toBe(20);
    expect(row?.group_id).toBe('group-1');
    expect(row?.external_key).toBe('PROJ-123');
    expect(row?.external_type).toBe('jira');
    expect(row?.sync_source).toBe('jira');
  });

  it('applies field defaults when only the required fields are provided', () => {
    const created = repo.add({
      id: 'item-2',
      project_id: 'project-1',
      title: 'Minimal item',
      item_order: 0,
    });

    expect(created.status).toBe('planned');
    expect(created.sync_source).toBe('local');
    expect(created.parent_id).toBeNull();
    expect(created.description).toBeNull();
    expect(created.intent).toBeNull();
    expect(created.acceptance_criteria).toBeNull();
    expect(created.source_document_id).toBeNull();
    expect(created.label).toBeNull();
    expect(created.release_tag).toBeNull();
    expect(created.status_category).toBeNull();
    expect(created.code_refs).toBeNull();
    expect(created.position_x).toBeNull();
    expect(created.position_y).toBeNull();
    expect(created.group_id).toBeNull();
    expect(created.external_key).toBeNull();
    expect(created.last_synced_at).toBeNull();
  });

  it('persists a single-field update of code_refs (JSON-encoded kind) as a decoded array via the fast path', () => {
    repo.add({ id: 'item-3', project_id: 'project-1', title: 'Fast path item', item_order: 0 });
    repo.update('item-3', { code_refs: ['src/c.ts'] });
    const row = repo.get('item-3');
    expect(row?.code_refs).toEqual(['src/c.ts']);
  });

  it('persists a single-field update of intent via the fast path', () => {
    repo.add({ id: 'item-4', project_id: 'project-1', title: 'Fast path item', item_order: 0 });
    repo.update('item-4', { intent: 'Updated intent' });
    const row = repo.get('item-4');
    expect(row?.intent).toBe('Updated intent');
  });
});
