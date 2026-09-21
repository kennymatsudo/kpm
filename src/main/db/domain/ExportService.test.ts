import { describe, expect, it, vi } from 'vitest';
import { createExportService } from './ExportService';
import { createSyncService } from './SyncService';
import { createPlanItem, createTestRepositoryContext } from '../../../../tests';
import type { ExternalIssue, TrackerClient } from '../../tracker-clients';

function createLinearClient(options: {
  createdIssue?: ExternalIssue;
  projectStatuses?: { id: string; name: string; categoryKey: string }[];
  deleteIssue?: TrackerClient['deleteIssue'];
  assigneeSkippedReason?: string;
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
    searchIssuesByText: vi.fn(async () => []),
    getRecentIssues: vi.fn(async () => []),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(async () => [{ id: 'linear-issue', name: 'Issue', subtask: false }]),
    createIssue: vi.fn(async () => ({
      id: 'issue-1',
      key: 'ENG-1',
      url: 'https://linear.app/example/issue/ENG-1',
      assigneeSkippedReason: options.assigneeSkippedReason,
    })),
    updateIssue: vi.fn(),
    deleteIssue: options.deleteIssue ?? vi.fn(),
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
    searchIssuesByText: vi.fn(async () => []),
    getRecentIssues: vi.fn(async () => []),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(async () => [{ id: 'story', name: 'Story', subtask: false }]),
    createIssue: vi.fn(async () => ({
      id: 'issue-1',
      key: 'PROJ-1',
      url: 'https://example.atlassian.net/browse/PROJ-1',
    })),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
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
    searchIssuesByText: vi.fn(async () => []),
    getRecentIssues: vi.fn(async () => []),
    fetchChildrenByParents: vi.fn(async () => []),
    formatCustomFieldsForApi: vi.fn((values) => values),
    getIssueTypes: vi.fn(async () => [{ id: 'linear-issue', name: 'Issue', subtask: false }]),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
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
  client: TrackerClient = createLinearClient(),
  options: { assignExportsToMe?: boolean } = {}
) {
  return createExportService({
    database: ctx.db,
    outboundChanges: ctx.repos.outboundChanges,
    planItems: ctx.repos.planItems,
    tracker: ctx.repos.tracker,
    sync: ctx.repos.sync,
    typeMappings: ctx.repos.typeMappings,
    trackerClientService: {
      getClient: vi.fn(async () => client),
      getJiraClient: vi.fn(),
    },
    shouldAssignExportsToMe: () => options.assignExportsToMe ?? false,
  });
}

/** Queue a single create so an assignment test only states what it varies. */
function queueSingleCreate(
  ctx: ReturnType<typeof createTestRepositoryContext>,
  projectName: string
) {
  const { project, association } = setupAssociation(ctx, projectName);
  ctx.repos.planItems.add(createPlanItem({
    id: 'plan-1',
    project_id: project.id,
    title: 'Ship fix',
    status_category: 'not_started',
  }));
  ctx.repos.outboundChanges.add({
    kpm_project_id: project.id,
    plan_item_id: 'plan-1',
    association_id: association.id,
    operation: 'create',
    target_issue_type_id: null,
    target_issue_type_name: null,
    target_parent_key: null,
    target_status_category: null,
    custom_field_overrides: null,
    queued_by: 'user',
  });
  return { project, association };
}

function setupAssociation(ctx: ReturnType<typeof createTestRepositoryContext>, projectName: string) {
  const project = ctx.repos.projects.create({ name: projectName });
  const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
  const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
  const association = ctx.repos.tracker.createAssociation(
    project.id,
    scope.id,
    JSON.stringify({ teamKey: 'ENG' }),
    'Engineering'
  );
  return { project, association };
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

  it('passes the mapped status name when creating an issue with a queued target status', async () => {
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
    ctx.repos.outboundChanges.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: null,
      target_issue_type_name: null,
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
      initialStatusName: 'Done',
    }));
    expect(ctx.repos.planItems.get('plan-1')?.status_category).toBe('done');
    expect(ctx.repos.tracker.getAssociationById(association.id)?.status_mapping?.done).toBe('Done');
  });

  it('refuses an approved item whose issue type cannot be resolved instead of pushing it', async () => {
    const ctx = createTestRepositoryContext();
    const { project, association } = queueSingleCreate(ctx, 'Unresolvable Type Project');
    const client = createLinearClient();
    client.getIssueTypes = vi.fn(async () => []);
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(client.createIssue).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors[0]?.error).toContain('Could not resolve');
    expect(ctx.repos.outboundChanges.getByPlanItem('plan-1')?.error_message).toContain('Could not resolve');
  });

  it.each([
    { assignExportsToMe: true, projectName: 'Assign On Project' },
    { assignExportsToMe: false, projectName: 'Assign Off Project' },
  ])('passes assignToSelf=$assignExportsToMe to the client per the setting', async ({ assignExportsToMe, projectName }) => {
    const ctx = createTestRepositoryContext();
    const { project, association } = queueSingleCreate(ctx, projectName);
    const client = createLinearClient();

    const result = await createService(ctx, client, { assignExportsToMe })
      .executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(client.createIssue).toHaveBeenCalledWith(expect.objectContaining({ assignToSelf: assignExportsToMe }));
  });

  it('warns without failing the export when the tracker refused the assignee', async () => {
    const ctx = createTestRepositoryContext();
    const { project, association } = queueSingleCreate(ctx, 'Assign Refused Project');
    const client = createLinearClient({ assigneeSkippedReason: 'Field cannot be set' });

    const result = await createService(ctx, client, { assignExportsToMe: true })
      .executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    expect(result.created).toHaveLength(1);
    expect(result.warnings).toEqual(['ENG-1 was created unassigned: Field cannot be set']);
  });

  it('records the tracker assignee and creator so a fresh export reports no inbound changes', async () => {
    const ctx = createTestRepositoryContext();
    const { project, association } = queueSingleCreate(ctx, 'People Writeback Project');
    const assignedIssue: ExternalIssue = {
      key: 'ENG-1',
      id: 'issue-1',
      title: 'Ship fix',
      description: null,
      issueType: 'Issue',
      status: 'Backlog',
      statusType: 'backlog',
      parentKey: null,
      epicKey: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://linear.app/example/issue/ENG-1',
      assignee: { id: 'user-1', name: 'kennymatsudo', avatarUrl: 'https://uploads.linear.app/avatar' },
      creator: { id: 'user-1', name: 'kennymatsudo', avatarUrl: 'https://uploads.linear.app/avatar' },
    };
    const client = createLinearClient({ createdIssue: assignedIssue });

    await createService(ctx, client, { assignExportsToMe: true })
      .executeApprovedExport(project.id, association.id, ['plan-1']);

    const exported = ctx.repos.planItems.get('plan-1');
    expect(exported?.external_assignee_id).toBe('user-1');
    expect(exported?.external_creator_name).toBe('kennymatsudo');

    // The regression this guards: people columns the export left null read as
    // remote changes on the very next inbound sync, so a just-exported issue
    // came back with phantom updates to apply.
    const snapshot = ctx.repos.sync.getSnapshotsByItemIds(['plan-1']).get('plan-1') ?? null;
    const analysis = createSyncService({
      database: ctx.db,
      planItems: ctx.repos.planItems,
      externalPlanItems: ctx.repos.externalPlanItems,
      sync: ctx.repos.sync,
      tracker: ctx.repos.tracker,
    }).analyzeChanges(exported!, assignedIssue, snapshot, null);

    expect(analysis.updates).toEqual([]);
    expect(analysis.conflicts).toEqual([]);
  });

  it('records the tracker assignee after updating an existing issue', async () => {
    const ctx = createTestRepositoryContext();
    const { project, association } = setupAssociation(ctx, 'People Update Project');
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-1',
      project_id: project.id,
      title: 'Linked issue',
      association_id: association.id,
      external_key: 'ENG-1',
      external_status: 'In Review',
      status_category: 'in_review',
    }));
    ctx.repos.outboundChanges.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'update',
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: null,
      custom_field_overrides: null,
      queued_by: 'user',
    });
    const client = createLinearUpdateClient([{
      ...linearInReviewIssue,
      assignee: { id: 'user-2', name: 'teammate', avatarUrl: null },
      creator: { id: 'user-1', name: 'kennymatsudo', avatarUrl: null },
    }]);

    const result = await createService(ctx, client)
      .executeApprovedExport(project.id, association.id, ['plan-1']);

    expect(result.success).toBe(true);
    const updated = ctx.repos.planItems.get('plan-1');
    expect(updated?.external_assignee_name).toBe('teammate');
    expect(updated?.external_assignee_avatar_url).toBeNull();
    expect(updated?.external_creator_id).toBe('user-1');
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
    ctx.repos.outboundChanges.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: null,
      target_issue_type_name: null,
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
    expect(vi.mocked(client.createIssue).mock.calls[0]?.[0].initialStatusName).toBeUndefined();
    expect(ctx.repos.planItems.get('plan-1')?.status_category).toBe('not_started');
  });

  it('reconciles references between items created in the same export batch', async () => {
    const ctx = createTestRepositoryContext();
    const { project, association } = setupAssociation(ctx, 'Reference Reconciliation Project');
    const firstId = '11111111-1111-4111-8111-111111111111';
    const secondId = '22222222-2222-4222-8222-222222222222';
    ctx.repos.planItems.add(createPlanItem({
      id: firstId,
      project_id: project.id,
      title: 'First task',
      description: `Depends on @plan/${secondId}`,
    }));
    ctx.repos.planItems.add(createPlanItem({
      id: secondId,
      project_id: project.id,
      title: 'Second task',
    }));

    for (const planItemId of [firstId, secondId]) {
      ctx.repos.outboundChanges.add({
        kpm_project_id: project.id,
        plan_item_id: planItemId,
        association_id: association.id,
        operation: 'create',
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
        target_status_category: 'not_started',
        custom_field_overrides: null,
        queued_by: 'user',
      });
    }

    let createdCount = 0;
    const client = createLinearClient();
    client.createIssue = vi.fn(async () => {
      createdCount += 1;
      return {
        id: `issue-${createdCount}`,
        key: `ENG-${createdCount}`,
        url: `https://linear.app/example/issue/ENG-${createdCount}`,
      };
    });
    client.fetchIssue = vi.fn(async (key) => ({
      key,
      id: `issue-${key.slice(4)}`,
      title: key === 'ENG-1' ? 'First task' : 'Second task',
      description: null,
      issueType: 'Issue',
      status: 'Backlog',
      statusType: 'backlog',
      parentKey: null,
      epicKey: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      url: `https://linear.app/example/issue/${key}`,
      assignee: null,
      creator: null,
    }));
    const service = createService(ctx, client);

    const result = await service.executeApprovedExport(project.id, association.id, [firstId, secondId]);

    expect(result.success).toBe(true);
    expect(client.createIssue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      description: 'Depends on Second task',
    }));
    expect(client.updateIssue).toHaveBeenCalledTimes(1);
    expect(client.updateIssue).toHaveBeenCalledWith('ENG-1', {
      description: 'Depends on [ENG-2](https://linear.app/example/issue/ENG-2)',
    });
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
    ctx.repos.outboundChanges.add({
      kpm_project_id: project.id,
      plan_item_id: 'plan-1',
      association_id: association.id,
      operation: 'create',
      target_issue_type_id: null,
      target_issue_type_name: null,
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
    const queueEntry = ctx.repos.outboundChanges.add({
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
    expect(ctx.repos.outboundChanges.get(queueEntry.id)).toBeUndefined();
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
    const queueEntry = ctx.repos.outboundChanges.add({
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
    expect(ctx.repos.outboundChanges.get(queueEntry.id)?.error_message).toContain('expected Done');
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
    expect(ctx.repos.outboundChanges.getByPlanItem('plan-1')?.target_status_category).toBe('done');
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
    const queueEntry = ctx.repos.outboundChanges.add({
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
    expect(ctx.repos.outboundChanges.get(queueEntry.id)).toBeUndefined();
  });

  describe('deletion drain', () => {
    it('calls deleteIssue with the snapshotted external key and drains the queue row on success', async () => {
      const ctx = createTestRepositoryContext();
      const { project, association } = setupAssociation(ctx, 'Deletion Drain Project');

      const deleteRow = ctx.repos.outboundChanges.addDelete({
        kpm_project_id: project.id,
        association_id: association.id,
        external_key: 'ENG-99',
        external_id: 'issue-99',
        tracker_type: 'linear',
        queued_by: 'user',
      });

      const deleteIssue = vi.fn(async () => {});
      const client = createLinearClient({ deleteIssue });
      const service = createService(ctx, client);

      const result = await service.executeApprovedExport(project.id, association.id, [], [deleteRow.id]);

      expect(result.success).toBe(true);
      expect(deleteIssue).toHaveBeenCalledWith('ENG-99');
      expect(result.deleted).toEqual([{ external_key: 'ENG-99' }]);
      expect(ctx.repos.outboundChanges.get(deleteRow.id)).toBeUndefined();
    });

    it('keeps the queue row and records the failure when deleteIssue rejects', async () => {
      const ctx = createTestRepositoryContext();
      const { project, association } = setupAssociation(ctx, 'Deletion Drain Project');

      const deleteRow = ctx.repos.outboundChanges.addDelete({
        kpm_project_id: project.id,
        association_id: association.id,
        external_key: 'ENG-99',
        external_id: 'issue-99',
        tracker_type: 'linear',
        queued_by: 'user',
      });

      const deleteIssue = vi.fn(async () => {
        throw new Error('Linear API unavailable');
      });
      const client = createLinearClient({ deleteIssue });
      const service = createService(ctx, client);

      const result = await service.executeApprovedExport(project.id, association.id, [], [deleteRow.id]);

      expect(result.success).toBe(false);
      expect(result.deleteErrors).toEqual([{ external_key: 'ENG-99', error: 'Linear API unavailable' }]);
      expect(ctx.repos.outboundChanges.get(deleteRow.id)?.error_message).toBe('Linear API unavailable');
    });

    it('keeps staged deletions in the preview when issue types cannot be fetched', async () => {
      const ctx = createTestRepositoryContext();
      const { project, association } = setupAssociation(ctx, 'Deletion Drain Project');

      ctx.repos.planItems.add(createPlanItem({
        id: 'plan-live',
        project_id: project.id,
        title: 'Live work',
      }));
      ctx.repos.outboundChanges.add({
        kpm_project_id: project.id,
        plan_item_id: 'plan-live',
        association_id: association.id,
        operation: 'create',
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
        target_status_category: null,
        queued_by: 'user',
      });
      const deleteRow = ctx.repos.outboundChanges.addDelete({
        kpm_project_id: project.id,
        association_id: association.id,
        external_key: 'ENG-99',
        external_id: 'issue-99',
        tracker_type: 'linear',
        queued_by: 'user',
      });

      const client = createLinearClient();
      client.getIssueTypes = vi.fn(async () => {
        throw new Error('Linear API unavailable');
      });
      const service = createService(ctx, client);

      const preview = await service.generateExportPreview(project.id, association.id);

      expect(preview.warnings[0]).toContain('Failed to fetch issue types');
      expect(preview.items[0]?.validationErrors[0]).toContain('Failed to fetch issue types');
      expect(preview.items[0]?.resolvedType).toBeNull();
      expect(preview.deleteItems.map(d => d.queueEntry.id)).toEqual([deleteRow.id]);
    });
  });

  describe('generateSyncReview deletions', () => {
    it('surfaces the current title/description/status for a pending delete', async () => {
      const ctx = createTestRepositoryContext();
      const { project, association } = setupAssociation(ctx, 'Review Deletions Project');
      ctx.repos.outboundChanges.addDelete({
        kpm_project_id: project.id,
        association_id: association.id,
        external_key: 'ENG-99',
        external_id: 'issue-99',
        tracker_type: 'linear',
        queued_by: 'user',
      });

      const client = createLinearClient();
      const service = createService(ctx, client);

      const review = await service.generateSyncReview(project.id, association.id);

      expect(review.deleteItems).toHaveLength(1);
      expect(review.deleteItems[0]?.decision).toBe('pending');
      expect(review.deleteItems[0]?.currentIssue).toEqual({
        title: 'Ship fix',
        description: null,
        status: 'Done',
        url: 'https://linear.app/example/issue/ENG-1',
      });
      expect(review.deleteItems[0]?.fetchError).toBeNull();
    });
  });
});
