import { describe, expect, it, beforeEach } from 'vitest';
import { createPlanItem, createTestRepositoryContext, type TestRepositoryContext } from '../';

describe('OutboundChangeRepository', () => {
  let ctx: TestRepositoryContext;
  let projectId: string;
  let associationId: string;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Queue Test Project' });
    projectId = project.id;

    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      projectId,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    associationId = association.id;

    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: projectId,
      title: 'Queued item',
      status_category: 'done',
    }));
  });

  it('persists target status and custom field overrides on insert', () => {
    const inserted = ctx.repos.outboundChanges.add({
      kpm_project_id: projectId,
      plan_item_id: 'plan-1',
      association_id: associationId,
      operation: 'update',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: 'done',
      custom_field_overrides: { customfield_1: 'value-1' },
      queued_by: 'user',
    });

    expect(inserted.target_status_category).toBe('done');
    expect(inserted.custom_field_overrides).toEqual({ customfield_1: 'value-1' });

    const refetched = ctx.repos.outboundChanges.get(inserted.id);
    expect(refetched?.target_status_category).toBe('done');
    expect(refetched?.custom_field_overrides).toEqual({ customfield_1: 'value-1' });
  });

  it('inserts a detached delete row snapshotting the external identity', () => {
    const deleteRow = ctx.repos.outboundChanges.addDelete({
      kpm_project_id: projectId,
      association_id: associationId,
      external_key: 'ENG-99',
      external_id: 'issue-99',
      tracker_type: 'linear',
      queued_by: 'user',
    });

    expect(deleteRow.operation).toBe('delete');
    expect(deleteRow.plan_item_id).toBeNull();
    expect(deleteRow.external_key).toBe('ENG-99');
    expect(deleteRow.external_id).toBe('issue-99');
    expect(deleteRow.tracker_type).toBe('linear');
  });

  it('rejects a second pending delete for the same association and external key', () => {
    const enqueue = () =>
      ctx.repos.outboundChanges.addDelete({
        kpm_project_id: projectId,
        association_id: associationId,
        external_key: 'ENG-100',
        external_id: 'issue-100',
        tracker_type: 'linear',
        queued_by: 'user',
      });

    expect(enqueue).not.toThrow();
    expect(enqueue).toThrow(/UNIQUE constraint/i);
  });
});
