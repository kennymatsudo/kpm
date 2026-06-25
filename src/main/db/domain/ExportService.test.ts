import { describe, expect, it, vi } from 'vitest';
import { createExportService } from './ExportService';
import { createPlanItem, createTestRepositoryContext } from '../../../../tests';
import type { ExternalIssue, TrackerClient } from '../../tracker-clients';

function createLinearClient(options: {
  createdIssue?: ExternalIssue;
  projectStatuses?: { id: string; name: string; categoryKey: string }[];
} = {}): TrackerClient {
  const createdIssue: ExternalIssue = options.createdIssue ?? {
    key: 'ENG-1',
    id: 'issue-1',
    title: 'Ship fix',
    description: null,
    issueType: 'Issue',
    status: 'Done',
    statusType: 'completed',
    parentKey: null,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://linear.app/example/issue/ENG-1',
    assignee: null,
    creator: null,
  };

  return {
    type: 'linear',
    documentCodec: {
      toExternal: (value) => value ?? null,
      fromExternal: (value) => typeof value === 'string' ? value : null,
    },
    testConnection: vi.fn(),
    getAvailableProjects: vi.fn(),
    async *fetchIssues() {},
    async *fetchIssuesByJql() {},
    fetchIssue: vi.fn(async () => createdIssue),
    searchIssues: vi.fn(),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(async () => [{ id: 'linear-issue', name: 'Issue', subtask: false }]),
    createIssue: vi.fn(async () => ({
      id: 'issue-1',
      key: 'ENG-1',
      self: 'https://linear.app/example/issue/ENG-1',
    })),
    updateIssue: vi.fn(),
    getTransitions: vi.fn(async () => []),
    transitionIssue: vi.fn(),
    getProjectStatuses: vi.fn(async () => options.projectStatuses ?? [
      { id: 'state-backlog', name: 'Backlog', categoryKey: 'new' },
      { id: 'state-started', name: 'In Progress', categoryKey: 'indeterminate' },
      { id: 'state-done', name: 'Done', categoryKey: 'done' },
    ]),
  };
}

function createJiraClient(): TrackerClient {
  const createdTodoIssue: ExternalIssue = {
    key: 'PROJ-1',
    id: 'issue-1',
    title: 'Ship Jira fix',
    description: null,
    issueType: 'Story',
    status: 'To Do',
    parentKey: null,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.atlassian.net/browse/PROJ-1',
    assignee: null,
    creator: null,
  };
  const transitionedDoneIssue: ExternalIssue = {
    ...createdTodoIssue,
    status: 'Done',
    updatedAt: '2026-01-01T00:01:00.000Z',
  };

  return {
    type: 'jira',
    documentCodec: {
      toExternal: (value) => value ?? null,
      fromExternal: (value) => typeof value === 'string' ? value : null,
    },
    testConnection: vi.fn(),
    getAvailableProjects: vi.fn(),
    async *fetchIssues() {},
    async *fetchIssuesByJql() {},
    fetchIssue: vi.fn()
      .mockResolvedValueOnce(createdTodoIssue)
      .mockResolvedValueOnce(transitionedDoneIssue),
    searchIssues: vi.fn(),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(async () => [{ id: 'story', name: 'Story', subtask: false }]),
    createIssue: vi.fn(async () => ({
      id: 'issue-1',
      key: 'PROJ-1',
      self: 'https://example.atlassian.net/rest/api/3/issue/issue-1',
    })),
    updateIssue: vi.fn(),
    getTransitions: vi.fn(async () => [{
      id: '31',
      name: 'Done',
      to: {
        id: 'done',
        name: 'Done',
        statusCategory: { key: 'done', name: 'Done' },
      },
    }]),
    transitionIssue: vi.fn(),
    getProjectStatuses: vi.fn(async () => [
      { id: 'todo', name: 'To Do', categoryKey: 'new' },
      { id: 'done', name: 'Done', categoryKey: 'done' },
    ]),
  };
}

function createLinearUpdateClient(fetchIssueResults: ExternalIssue[]): TrackerClient {
  const fetchIssue = vi.fn();
  for (const issue of fetchIssueResults) {
    fetchIssue.mockResolvedValueOnce(issue);
  }
  fetchIssue.mockResolvedValue(fetchIssueResults[fetchIssueResults.length - 1]);

  return {
    type: 'linear',
    documentCodec: {
      toExternal: (value) => value ?? null,
      fromExternal: (value) => typeof value === 'string' ? value : null,
    },
    testConnection: vi.fn(),
    getAvailableProjects: vi.fn(),
    async *fetchIssues() {},
    async *fetchIssuesByJql() {},
    fetchIssue,
    searchIssues: vi.fn(),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    getTransitions: vi.fn(async () => [{
      id: 'state-done',
      name: 'Move to Done',
      to: {
        id: 'state-done',
        name: 'Done',
        statusCategory: { key: 'done', name: 'Done' },
      },
    }]),
    transitionIssue: vi.fn(),
    getProjectStatuses: vi.fn(async () => [
      { id: 'state-review', name: 'In Review', categoryKey: 'indeterminate' },
      { id: 'state-done', name: 'Done', categoryKey: 'done' },
    ]),
  };
}

function createService(
  ctx: ReturnType<typeof createTestRepositoryContext>,
  client: TrackerClient = createLinearClient()
) {
  return createExportService({
    database: ctx.db,
    syncQueue: ctx.repos.syncQueue,
    planItems: ctx.repos.planItems,
    tracker: ctx.repos.tracker,
    sync: ctx.repos.sync,
    typeMappings: ctx.repos.typeMappings,
    trackerClientService: {
      getClient: vi.fn(async () => client),
      getJiraClient: vi.fn(),
    },
  });
}

describe('ExportService', () => {
  const linearInReviewIssue: ExternalIssue = {
    key: 'ENG-1',
    id: 'issue-1',
    title: 'Linked issue',
    description: null,
    issueType: 'Issue',
    status: 'In Review',
    statusType: 'started',
    parentKey: null,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://linear.app/example/issue/ENG-1',
    assignee: null,
    creator: null,
  };
  const linearDoneIssue: ExternalIssue = {
    ...linearInReviewIssue,
    status: 'Done',
    statusType: 'completed',
    updatedAt: '2026-01-01T00:01:00.000Z',
  };

  it('passes mapped Linear state id when creating an issue with a queued target status', async () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Export Test Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );

    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Ship fix',
      status_category: 'done',
    }));
    ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: 'linear-issue',
      target_issue_type_name: 'Issue',
      target_parent_key: null,
      target_status_category: 'done',
      custom_field_overrides: null,
      queued_by: 'user',
    });

    const client = createLinearClient();
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(client.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      targetStatusId: 'state-done',
    }));
    expect(ctx.repos.planItems.get('plan-1')?.status_category).toBe('done');
    expect(ctx.repos.tracker.getAssociationById(association.id)?.status_mapping?.done).toBe('Done');
  });

  it('does not require a Linear status mapping for default not-started creates', async () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Default Status Export Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );

    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Default state item',
      status_category: 'not_started',
    }));
    ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: 'linear-issue',
      target_issue_type_name: 'Issue',
      target_parent_key: null,
      target_status_category: 'not_started',
      custom_field_overrides: null,
      queued_by: 'user',
    });

    const client = createLinearClient({
      createdIssue: {
        key: 'ENG-1',
        id: 'issue-1',
        title: 'Default state item',
        description: null,
        issueType: 'Issue',
        status: 'Intake',
        statusType: 'unstarted',
        parentKey: null,
        epicKey: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        url: 'https://linear.app/example/issue/ENG-1',
        assignee: null,
        creator: null,
      },
      projectStatuses: [
        { id: 'state-intake', name: 'Intake', categoryKey: 'new' },
        { id: 'state-grooming', name: 'Grooming', categoryKey: 'new' },
      ],
    });
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(vi.mocked(client.createIssue).mock.calls[0]?.[0].targetStatusId).toBeUndefined();
    expect(ctx.repos.planItems.get('plan-1')?.status_category).toBe('not_started');
  });

  it('transitions newly created Jira issues to the queued target status', async () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Jira Export Project' });
    const connection = ctx.repos.tracker.createConnection('jira', 'example.atlassian.net', 'Jira');
    const scope = ctx.repos.tracker.createScope(connection.id, 'PROJ', 'Project');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      'project = PROJ',
      'Project'
    );

    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Ship Jira fix',
      status_category: 'done',
    }));
    ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: 'story',
      target_issue_type_name: 'Story',
      target_parent_key: null,
      target_status_category: 'done',
      custom_field_overrides: null,
      queued_by: 'user',
    });

    const client = createJiraClient();
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(client.transitionIssue).toHaveBeenCalledWith('PROJ-1', '31', true);
    expect(ctx.repos.planItems.get('plan-1')?.external_status).toBe('Done');
    expect(ctx.repos.planItems.get('plan-1')?.status_category).toBe('done');
  });

  it('records the fetched Linear status after transitioning an existing issue', async () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Linked Linear Export Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    ctx.repos.tracker.updateStatusMapping(association.id, {
      in_review: 'In Review',
      done: 'Done',
    });
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Linked issue',
      association_id: association.id,
      external_key: 'ENG-1',
      external_status: 'In Review',
      status_category: 'done',
    }));
    const queueEntry = ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'update',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: 'done',
      custom_field_overrides: null,
      queued_by: 'user',
    });
    const client = createLinearUpdateClient([
      linearInReviewIssue,
      linearInReviewIssue,
      linearDoneIssue,
    ]);
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(client.transitionIssue).toHaveBeenCalledWith('ENG-1', 'state-done', true);
    expect(ctx.repos.planItems.get('plan-1')?.external_status).toBe('Done');
    expect(ctx.repos.syncQueue.get(queueEntry.id)).toBeUndefined();
  });

  it('keeps the queue entry when Linear does not reach the exported status', async () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Failed Linear Export Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    ctx.repos.tracker.updateStatusMapping(association.id, {
      in_review: 'In Review',
      done: 'Done',
    });
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Linked issue',
      association_id: association.id,
      external_key: 'ENG-1',
      external_status: 'In Review',
      status_category: 'done',
    }));
    const queueEntry = ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'update',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: 'done',
      custom_field_overrides: null,
      queued_by: 'user',
    });
    const client = createLinearUpdateClient([
      linearInReviewIssue,
      linearInReviewIssue,
      linearInReviewIssue,
    ]);
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(false);
    expect(result.errors[0]?.error).toContain('expected Done');
    expect(ctx.repos.syncQueue.get(queueEntry.id)?.error_message).toContain('expected Done');
  });

  it('preserves current board status when manually queueing a local item', () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Manual Queue Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Already complete',
      status_category: 'done',
    }));

    const service = createService(ctx);
    const result = service.queueItems(project.id, ['plan-1'], 'user', association.id);

    expect(result.queued).toEqual(['plan-1']);
    expect(ctx.repos.syncQueue.getByPlanItem('plan-1')?.target_status_category).toBe('done');
  });

  it('uses status mappings when deciding whether a queued status was reverted', () => {
    const ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Mapped Status Project' });
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      project.id,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    ctx.repos.tracker.updateStatusMapping(association.id, { done: 'Ready to Ship' });
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Mapped status item',
      association_id: association.id,
      external_key: 'ENG-1',
      external_status: 'Ready to Ship',
      status_category: 'in_progress',
    }));
    const queueEntry = ctx.repos.syncQueue.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'update',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: 'in_progress',
      custom_field_overrides: null,
      queued_by: 'user',
    });

    const service = createService(ctx);
    const result = service.updateQueueStatus(queueEntry.id, 'done');

    expect(result).toEqual({ removed: true });
    expect(ctx.repos.syncQueue.get(queueEntry.id)).toBeUndefined();
  });
});
