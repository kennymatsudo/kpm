import { beforeEach, describe, expect, it } from 'vitest';
import { installMockApi } from '../../../tests/mocks/electron-api';
import { getRegisteredStoreNames, resetAllProjectScopedStores } from './projectScopedStores';
import { useChatStore } from './chat';
import { createInitialPerSessionState } from './chat/baseState';
import { useTrackerStore } from './trackerStore';
import { useFileTreeStore } from './fileTreeStore';
import { useExportStore } from './tracker/useExportStore';
import { useTrackerConfigStore } from './tracker/useConfigStore';
import { useSyncStore } from './tracker/useSyncStore';
import { useSyncReviewStore } from './tracker/useSyncReviewStore';
import { useDevSessionsStore } from './devSessions';
import { useWorkspaceStore } from './workspaceStore';
import { useProjectStore } from './projectStore';
import { useTaskPromptTemplateStore } from './taskPromptTemplateStore';
import { useProposedChangeDisposal } from './proposedChangeDisposal';
import { useTerminalStore } from './terminalStore';
import { useLinearDocumentsStore } from './linearDocumentsStore';
import { usePermissionStore } from './permissionStore';
import { useActivityStore } from './activityStore';
import type { PlanItem, OutboundItemChange, SyncReviewItem } from '../../shared/types';

function createPlanItem(id: string, projectId: string): PlanItem {
  return {
    id,
    project_id: projectId,
    parent_id: null,
    title: 'Old project item',
    description: null,
    label: null,
    item_order: 0,
    code_refs: null,
    status: 'planned',
    release_tag: null,
    association_id: null,
    external_id: null,
    external_status: null,
    status_category: null,
    external_url: null,
    external_issue_type: null,
    external_parent_key: null,
    external_epic_key: null,
    sync_source: 'local',
    last_synced_at: null,
    intent: null,
    acceptance_criteria: null,
    work_brief_revision: 1,
    source_document_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    external_key: null,
    external_type: null,
  };
}

function createDevSession(id: string) {
  return {
    id,
    project_id: 'old-project',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    name: 'Implement feature',
    repo_name: 'my-repo',
    branch_name: 'kpm/test-branch',
    base_branch: 'main',
    base_sha: null,
    worktree_path: '/tmp/worktree',
    status: 'inactive' as const,
    agent_type: 'claude' as const,
    review_policy: 'auto' as const,
    initial_instructions: 'Implement the task',
    work_brief_revision: 1,
    automation_phase: null,
    playbook_id: null,
    playbook_snapshot: null,
    current_step_id: null,
    step_pass_counts: null,
    paused_reason: null,
    pr_number: null,
    pr_url: null,
    pr_state: null,
    review_state: null,
    pr_is_draft: false,
    merge_order: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    completed_at: null,
    latest_agent_review: null,
    plan_item: null,
  };
}

function createQueueEntry(id: string, planItemId: string): OutboundItemChange {
  return {
    id,
    kpm_project_id: 'old-project',
    plan_item_id: planItemId,
    association_id: 'assoc-1',
    operation: 'create',
    target_issue_type_id: 'task',
    target_issue_type_name: 'Task',
    target_parent_key: null,
    target_status_category: null,
    custom_field_overrides: null,
    queued_by: 'user',
    queued_at: '2024-01-01T00:00:00.000Z',
    error_message: null,
    external_key: null,
    external_id: null,
    tracker_type: null,
  };
}

function createSyncReviewItem(planItemId: string, queueEntryId: string): SyncReviewItem {
  return {
    queueEntry: createQueueEntry(queueEntryId, planItemId),
    planItem: createPlanItem(planItemId, 'old-project'),
    resolvedType: { id: 'task', name: 'Task' },
    resolvedParent: null,
    resolvedDescription: null,
    validationErrors: [],
    jiraCurrent: null,
    diffs: null,
    statusTransition: null,
    decision: 'pending',
    hasConflict: false,
  };
}

describe('resetAllProjectScopedStores', () => {
  beforeEach(() => {
    installMockApi();
    for (const store of [
      useChatStore, useTrackerStore, useFileTreeStore, useExportStore, useTrackerConfigStore,
      useSyncStore, useSyncReviewStore, useDevSessionsStore, useWorkspaceStore,
      useProjectStore, useTaskPromptTemplateStore,
    ]) {
      store.getState().reset();
    }
    // These two only expose resetProjectState (no full `reset`), which is
    // exactly the state this suite cares about clearing between cases.
    useTerminalStore.getState().resetProjectState();
    useLinearDocumentsStore.getState().resetProjectState();
    useProposedChangeDisposal.getState().resetProject();
  });

  it('registers every store that needs project-scoped cleanup', () => {
    expect(getRegisteredStoreNames()).toEqual([
      'chat', 'tracker', 'export', 'trackerConfig', 'sync', 'syncReview', 'fileTree',
      'devSessions', 'workspace', 'project', 'taskPromptTemplates',
      'linearDocuments', 'proposedChanges', 'terminals',
    ]);
  });

  it('leaves no registered store holding the previous project\'s data', () => {
    useChatStore.setState({
      sessions: new Map([['session-1', createInitialPerSessionState(1)]]),
      activeSessionIds: new Set(['session-1']),
      viewedSessionId: 'session-1',
      persistedProjectId: 'old-project',
    });

    useTrackerStore.setState({
      associations: [{
        id: 'assoc-1', kpm_project_id: 'old-project', scope_id: 'scope-1',
        issue_filter: 'project = OLD', display_name: 'Old', status_mapping: null,
        custom_field_values: null, epic_key: null, last_synced_at: null,
        created_at: '2024-01-01T00:00:00.000Z', tracker_type: 'jira', project_key: 'OLD',
        project_name: 'Old', site_url: 'https://example.atlassian.net',
      }],
    });

    useExportStore.setState({
      queueEntries: [createQueueEntry('queue-1', 'plan-1')],
      queueCount: 1,
      queuedItemIds: new Set(['plan-1']),
      typeMappings: [{
        id: 'mapping-1', kpm_project_id: 'old-project', scope_id: 'scope-1',
        kpm_label: 'task', tracker_issue_type_id: '1', tracker_issue_type_name: 'Task',
        created_at: '2024-01-01T00:00:00.000Z',
      }],
    });

    useTrackerConfigStore.setState({
      customFieldsByContext: { 'OLD:1': [] },
      customFieldsLastFetchedAt: { 'OLD:1': Date.now() },
    });

    useSyncStore.setState({
      syncAvailability: {
        'assoc-1': {
          isChecking: false, hasIncomingChanges: true, changeCount: 3,
          lastCheckedAt: '2024-01-01T00:00:00.000Z',
          stats: { total: 3, new: 3, updated: 0, conflicts: 0, deleted: 0, unchanged: 0 },
          error: null,
        },
      },
      resolutions: { 'plan-1': 'keep_mine' },
    });

    useSyncReviewStore.setState({
      items: [createSyncReviewItem('plan-1', 'queue-1')],
      phase: 'reviewing',
    });

    useFileTreeStore.setState({
      projectId: 'old-project',
      nodes: [{ name: 'src', path: 'src', isDirectory: true, isSymlink: false, modifiedAt: '2024-01-01T00:00:00.000Z', size: 0 }],
      selectedPaths: new Set(['src']),
    });

    useDevSessionsStore.setState({
      projectId: 'old-project',
      sessions: [createDevSession('dev-session-1')],
    });

    useWorkspaceStore.setState({
      currentProjectId: 'old-project',
      fileTreesBySource: { project: [{ name: 'src', path: 'src', isDirectory: true, isSymlink: false, modifiedAt: '2024-01-01T00:00:00.000Z', size: 0 }] },
      selectedFile: { source: 'project', path: 'src/index.ts' },
    });

    useProjectStore.setState({
      currentProjectId: 'old-project',
      planItems: [createPlanItem('plan-1', 'old-project')],
    });

    useTaskPromptTemplateStore.setState({
      scope: 'project',
      currentProjectId: 'old-project',
      templates: [{
        id: 'template-1', project_id: 'old-project', name: 'Old template',
        prompt_content: 'do the thing', is_default: false,
        created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
      }],
      selectedTemplateId: 'template-1',
    });

    useProposedChangeDisposal.getState().propose({
      type: 'document', projectId: 'old-project', filePath: 'notes.md',
      content: 'old content', oldContent: null,
    });
    expect(useProposedChangeDisposal.getState().pending).toHaveLength(1);

    useTerminalStore.setState({
      terminals: [{ id: 'terminal-1', projectId: 'old-project', status: 'running' }],
      activeTerminalId: 'terminal-1',
      panelHeight: 400,
    });

    useLinearDocumentsStore.setState({
      links: [{
        id: 'link-1', project_id: 'old-project', document_path: 'notes.md',
        linear_document_id: 'lin-doc-1', slug_id: null, document_title: null, document_url: null,
        parent_kind: 'project', parent_id: 'old-project',
        direction: 'push-only', last_synced_at: null, local_content_hash: null,
        remote_content_hash: null, remote_version: null,
        created_at: '2024-01-01T00:00:00.000Z',
      }],
      syncPreview: {
        hasConflict: false, localChanged: true, remoteChanged: false, isInitialSync: false,
        hasContentDifference: true, localContent: 'local', remoteContent: 'remote',
        remoteVersion: 1, pushReceipt: 'push-receipt', pullReceipt: 'pull-receipt',
      },
    });

    resetAllProjectScopedStores();

    expect(useChatStore.getState().sessions.size).toBe(0);
    expect(useChatStore.getState().activeSessionIds.size).toBe(0);
    expect(useChatStore.getState().viewedSessionId).toBeNull();

    expect(useTrackerStore.getState().associations).toEqual([]);

    expect(useExportStore.getState().queueEntries).toEqual([]);
    expect(useExportStore.getState().queuedItemIds.size).toBe(0);
    expect(useExportStore.getState().typeMappings).toEqual([]);

    expect(useTrackerConfigStore.getState().customFieldsByContext).toEqual({});
    expect(useTrackerConfigStore.getState().customFieldsLastFetchedAt).toEqual({});

    expect(useSyncStore.getState().syncAvailability).toEqual({});
    expect(useSyncStore.getState().resolutions).toEqual({});

    expect(useSyncReviewStore.getState().items).toEqual([]);
    expect(useSyncReviewStore.getState().phase).toBe('idle');

    expect(useFileTreeStore.getState().projectId).toBeNull();
    expect(useFileTreeStore.getState().nodes).toEqual([]);
    expect(useFileTreeStore.getState().selectedPaths.size).toBe(0);

    expect(useDevSessionsStore.getState().projectId).toBeNull();
    expect(useDevSessionsStore.getState().sessions).toEqual([]);

    expect(useWorkspaceStore.getState().currentProjectId).toBeNull();
    expect(useWorkspaceStore.getState().fileTreesBySource).toEqual({});
    expect(useWorkspaceStore.getState().selectedFile).toBeNull();

    expect(useProjectStore.getState().planItems).toEqual([]);

    expect(useTaskPromptTemplateStore.getState().templates).toEqual([]);
    expect(useTaskPromptTemplateStore.getState().selectedTemplateId).toBeNull();


    expect(useProposedChangeDisposal.getState().pending).toEqual([]);

    expect(useTerminalStore.getState().terminals).toEqual([]);
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();

    expect(useLinearDocumentsStore.getState().links).toEqual([]);
    expect(useLinearDocumentsStore.getState().syncPreview).toBeNull();
  });

  it('does not reset permissionStore or activityStore — they describe work outside the open project', () => {
    usePermissionStore.setState({
      pendingRequests: new Map([['chat-1', [{
        requestId: 'req-1', projectId: 'old-project', chatSessionId: 'chat-1',
        toolName: 'Write', targetPath: '/tmp/file.ts', preview: 'Write /tmp/file.ts',
        kind: 'write-access',
      }]]]),
    });
    useActivityStore.setState({
      byProject: { 'old-project': { projectId: 'old-project', chatTurns: 1, agentsWorking: 0, agentsAwaitingInput: 0, terminals: 0 } },
    });

    resetAllProjectScopedStores();

    expect(usePermissionStore.getState().pendingRequests.get('chat-1')).toHaveLength(1);
    expect(useActivityStore.getState().byProject['old-project']).toBeDefined();
  });

  it('preserves terminal panel geometry across a terminal reset', () => {
    useTerminalStore.setState({
      terminals: [{ id: 'terminal-1', projectId: 'old-project', status: 'running' }],
      activeTerminalId: 'terminal-1',
      panelHeight: 400,
      isPanelOpen: true,
    });

    resetAllProjectScopedStores();

    expect(useTerminalStore.getState().terminals).toEqual([]);
    expect(useTerminalStore.getState().panelHeight).toBe(400);
    expect(useTerminalStore.getState().isPanelOpen).toBe(true);
  });

  it('preserves the model and provider preference across the chat reset', () => {
    useChatStore.setState({
      model: 'opus',
      provider: 'claude',
      sessions: new Map([['session-1', createInitialPerSessionState(1)]]),
    });

    resetAllProjectScopedStores();

    expect(useChatStore.getState().sessions.size).toBe(0);
    expect(useChatStore.getState().model).toBe('opus');
    expect(useChatStore.getState().provider).toBe('claude');
  });

  it('preserves the project list and current project across the project store reset', () => {
    const projects = [
      { id: 'old-project', name: 'Old Project', folder_path: '/tmp/old', phase: 'discovery' as const, session_tokens: 0, session_input_tokens: 0, session_output_tokens: 0, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
    ];
    useProjectStore.setState({
      projects,
      currentProjectId: 'old-project',
      planItems: [createPlanItem('plan-1', 'old-project')],
    });

    resetAllProjectScopedStores();

    expect(useProjectStore.getState().planItems).toEqual([]);
    expect(useProjectStore.getState().projects).toEqual(projects);
    expect(useProjectStore.getState().currentProjectId).toBe('old-project');
  });

  it('keeps global-scope templates loaded but clears project-scope template data', () => {
    const globalTemplate = {
      id: 'template-global', project_id: null, name: 'Global default',
      prompt_content: 'do the thing globally', is_default: true,
      created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    };
    useTaskPromptTemplateStore.setState({
      scope: 'global',
      currentProjectId: null,
      templates: [globalTemplate],
      selectedTemplateId: 'template-global',
    });

    resetAllProjectScopedStores();

    expect(useTaskPromptTemplateStore.getState().scope).toBe('global');
    expect(useTaskPromptTemplateStore.getState().templates).toEqual([globalTemplate]);
    expect(useTaskPromptTemplateStore.getState().selectedTemplateId).toBe('template-global');
  });
});
