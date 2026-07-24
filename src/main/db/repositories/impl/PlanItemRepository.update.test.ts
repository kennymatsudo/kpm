import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { PlanItemRepository } from './PlanItemRepository';
import type { PlanItem } from '../../../../shared/types';

function seedProjectAndItem(db: Database): PlanItem {
  db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES (?, ?, ?)`).run(
    'project-1',
    'Test Project',
    '/tmp/test-project'
  );

  const repo = new PlanItemRepository(db);
  return repo.add({
    id: 'item-1',
    project_id: 'project-1',
    parent_id: null,
    title: 'Original title',
    description: null,
    intent: null,
    acceptance_criteria: null,
    source_document_id: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    position_x: null,
    position_y: null,
    group_id: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_status: null,
    status_category: 'not_started',
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
  });
}

describe('PlanItemRepository.update (registry-generated slow path)', () => {
  let db: Database;
  let repo: PlanItemRepository;

  beforeEach(() => {
    db = createTestDb();
    seedProjectAndItem(db);
    repo = new PlanItemRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('writes multiple registry fields and increments the Work Brief revision once', () => {
    repo.update('item-1', { title: 'New title', intent: 'New intent', release_tag: 'v1.0' });
    const row = repo.get('item-1');
    expect(row?.title).toBe('New title');
    expect(row?.intent).toBe('New intent');
    expect(row?.release_tag).toBe('v1.0');
    expect(row?.work_brief_revision).toBe(2);
  });

  it('does not increment the Work Brief revision for semantically unchanged IPC values', () => {
    repo.update('item-1', { title: 'Original title', description: null });
    expect(repo.get('item-1')?.work_brief_revision).toBe(1);
  });

  it('JSON-encodes acceptance_criteria on write and round-trips through get()', () => {
    repo.update('item-1', { acceptance_criteria: ['Criterion A', 'Criterion B'], title: 'multi-field to hit slow path' });
    const row = repo.get('item-1');
    expect(row?.acceptance_criteria).toEqual(['Criterion A', 'Criterion B']);
  });

  it('stores an empty acceptance_criteria array as SQL NULL', () => {
    repo.update('item-1', { acceptance_criteria: [], title: 'multi-field to hit slow path' });
    const raw = db.prepare('SELECT acceptance_criteria FROM plan_items WHERE id = ?').get('item-1') as {
      acceptance_criteria: string | null;
    };
    expect(raw.acceptance_criteria).toBeNull();
  });

  it('stores acceptance_criteria as NULL when explicitly set to null', () => {
    repo.update('item-1', { acceptance_criteria: ['x'], title: 'multi-field to hit slow path' });
    repo.update('item-1', { acceptance_criteria: null, description: 'still multi-field' });
    const raw = db.prepare('SELECT acceptance_criteria FROM plan_items WHERE id = ?').get('item-1') as {
      acceptance_criteria: string | null;
    };
    expect(raw.acceptance_criteria).toBeNull();
  });

  it('JSON-encodes code_refs on write and round-trips through get()', () => {
    repo.update('item-1', { code_refs: ['src/a.ts', 'src/b.ts'], title: 'multi-field to hit slow path' });
    const row = repo.get('item-1');
    expect(row?.code_refs).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('sets completed_at when status_category transitions to done', () => {
    repo.update('item-1', { status_category: 'done', title: 'multi-field to hit slow path' });
    const row = repo.get('item-1');
    expect(row?.status_category).toBe('done');
    expect(row?.completed_at).not.toBeNull();
  });

  it('clears completed_at when status_category moves away from done', () => {
    repo.update('item-1', { status_category: 'done' });
    repo.update('item-1', { status_category: 'in_progress', title: 'multi-field to hit slow path' });
    const row = repo.get('item-1');
    expect(row?.completed_at).toBeNull();
  });

  it('leaves sync-only fields untouched when updating registry fields', () => {
    repo.update('item-1', { external_key: 'PROJ-123' });
    repo.update('item-1', { title: 'multi-field to hit slow path', description: 'd' });
    const row = repo.get('item-1');
    expect(row?.external_key).toBe('PROJ-123');
  });

  it('null clears a nullable text field', () => {
    repo.update('item-1', { intent: 'set once', title: 'multi-field to hit slow path' });
    repo.update('item-1', { intent: null, description: 'still multi-field' });
    const row = repo.get('item-1');
    expect(row?.intent).toBeNull();
  });
});
