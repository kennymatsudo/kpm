/**
 * Mock implementation of the window.api object
 *
 * Use this to mock IPC calls in renderer tests.
 * Each method returns a sensible default and can be overridden per test.
 */

import { vi } from 'vitest';
import type {
  Project,
  PlanItem,
  PlanRelation,
  Repo,
  Attachment,
  PlanActionResult,
  TrackerCredentialInfo,
  TrackerConnection,
  TrackerProjectScope,
  TrackerAssociationWithScope,
  SyncQueueEntryWithPlanItem,
  TrackerTypeMapping,
  ExportPreview,
  ExportResult,
  SyncPreview,
  SyncResult,
  ImportPreview,
  ImportResult,
  SyncReviewData,
} from '../../src/shared/types';

const noopUnsub = vi.fn().mockReturnValue(() => {});

// =============================================================================
// Mock API Implementation
// =============================================================================

export function createMockApi() {
  return {
    tempImages: {
      save: vi.fn().mockResolvedValue({ success: true, path: '/tmp/mock.png', filename: 'mock.png' }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },

    chat: {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      newSession: vi.fn().mockResolvedValue({ success: true }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
      getUsage: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      getMessages: vi.fn().mockResolvedValue({ success: true, messages: [] }),
      onChunk: noopUnsub,
      onPlanActions: noopUnsub,
      onDone: noopUnsub,
      onError: noopUnsub,
      onActivity: noopUnsub,
      onClaudeMdUpdate: noopUnsub,
    },

    projects: {
      list: vi.fn().mockResolvedValue([] as Project[]),
      create: vi.fn().mockImplementation((name: string) =>
        Promise.resolve({
          id: 'test-project-id',
          name,
          folder_path: `/tmp/projects/${name}`,
          session_id: null,
          phase: 'discovery',
          session_tokens: 0,
          session_input_tokens: 0,
          session_output_tokens: 0,
        } as Project)
      ),
      get: vi.fn().mockResolvedValue(null as Project | null),
      update: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      openFolder: vi.fn().mockResolvedValue({ success: true }),
    },

    repos: {
      list: vi.fn().mockResolvedValue([] as Repo[]),
      remove: vi.fn().mockResolvedValue({ success: true }),
      getBranch: vi.fn().mockResolvedValue(null as string | null),
      watch: vi.fn().mockResolvedValue({ success: true }),
      unwatch: vi.fn().mockResolvedValue({ success: true }),
      onBranchChanged: noopUnsub,
    },

    attachments: {
      list: vi.fn().mockResolvedValue([] as Attachment[]),
      remove: vi.fn().mockResolvedValue({ success: true }),
      selectDialog: vi.fn().mockResolvedValue([] as string[]),
    },

    plan: {
      listItems: vi.fn().mockResolvedValue([] as PlanItem[]),
      executeActions: vi.fn().mockResolvedValue({
        success: true,
        createdIds: {},
        skippedActions: [],
      removeRelation: vi.fn().mockResolvedValue({ success: true }),
      getRelations: vi.fn().mockResolvedValue([] as PlanRelation[]),
      updatePosition: vi.fn().mockResolvedValue({ success: true }),
      updateItem: vi.fn().mockResolvedValue({ success: true }),
      deleteItem: vi.fn().mockResolvedValue({ success: true }),
      deleteItemWithDescendants: vi.fn().mockResolvedValue({ success: true }),
      getChildCount: vi.fn().mockResolvedValue(0),
    },

    tracker: {
      credentials: {
        list: vi.fn().mockResolvedValue([] as TrackerCredentialInfo[]),
        saveJira: vi.fn().mockResolvedValue({ success: true }),
        delete: vi.fn().mockResolvedValue({ success: true }),
        testJira: vi.fn().mockResolvedValue({ success: true }),
      },
      connections: {
        list: vi.fn().mockResolvedValue([] as TrackerConnection[]),
      },
      scopes: {
        list: vi.fn().mockResolvedValue([] as TrackerProjectScope[]),
        add: vi.fn().mockResolvedValue({ success: true }),
      },
      associations: {
        list: vi.fn().mockResolvedValue([] as TrackerAssociationWithScope[]),
        add: vi.fn().mockResolvedValue({ success: true }),
        remove: vi.fn().mockResolvedValue({ success: true }),
        hasImported: vi.fn().mockResolvedValue(false),
      },
      projects: {
        list: vi.fn().mockResolvedValue({ success: true, projects: [] }),
        getLabels: vi.fn().mockResolvedValue({ success: true, labels: [] }),
        getComponents: vi.fn().mockResolvedValue({ success: true, components: [] }),
      },
      issues: {
        search: vi.fn().mockResolvedValue({ success: true, issues: [] }),
        searchByJql: vi.fn().mockResolvedValue({ success: true, issues: [] }),
        getRecent: vi.fn().mockResolvedValue({ success: true, issues: [] }),
      },
      import: {
        getPreview: vi.fn().mockResolvedValue({ success: true, preview: null as unknown as ImportPreview }),
        onProgress: noopUnsub,
      },
      sync: {
        getPreview: vi.fn().mockResolvedValue({ success: true, preview: null as unknown as SyncPreview }),
        onProgress: noopUnsub,
      },
      exportQueue: {
        get: vi.fn().mockResolvedValue({ success: true, entries: [] as SyncQueueEntryWithPlanItem[] }),
        add: vi.fn().mockResolvedValue({ success: true }),
        remove: vi.fn().mockResolvedValue({ success: true }),
        updateStatus: vi.fn().mockResolvedValue({ success: true }),
        clear: vi.fn().mockResolvedValue({ success: true }),
        count: vi.fn().mockResolvedValue({ success: true, count: 0 }),
      },
      export: {
        getPreview: vi.fn().mockResolvedValue({ success: true, preview: null as unknown as ExportPreview }),
        getReview: vi.fn().mockResolvedValue({ success: true, reviewData: null as unknown as SyncReviewData }),
        executeApproved: vi.fn().mockResolvedValue({ success: true, result: null as unknown as ExportResult }),
      },
      typeMappings: {
        get: vi.fn().mockResolvedValue({ success: true, mappings: [] as TrackerTypeMapping[] }),
        getByScope: vi.fn().mockResolvedValue({ success: true, mappings: [] as TrackerTypeMapping[] }),
        save: vi.fn().mockResolvedValue({ success: true }),
        remove: vi.fn().mockResolvedValue({ success: true }),
        createDefaults: vi.fn().mockResolvedValue({ success: true }),
      },
      issueTypes: {
        get: vi.fn().mockResolvedValue({ success: true, issueTypes: [] }),
      },
    },

    claudeMd: {
      read: vi.fn().mockResolvedValue({ success: true, content: '' }),
      write: vi.fn().mockResolvedValue({ success: true }),
      watch: vi.fn().mockResolvedValue({ success: true }),
      unwatch: vi.fn().mockResolvedValue({ success: true }),
      onChanged: noopUnsub,
    },

    contextFiles: {
      list: vi.fn().mockResolvedValue({ success: true, files: [] }),
      read: vi.fn().mockResolvedValue({ success: true, content: '' }),
      write: vi.fn().mockResolvedValue({ success: true }),
      onChanged: noopUnsub,
    },

    menu: {
      onNewProject: noopUnsub,
      onOpenProject: noopUnsub,
    },

    storybook: {
      updateUrl: vi.fn().mockResolvedValue({ success: true }),
      testConnection: vi.fn().mockResolvedValue({ success: true, componentCount: 0 }),
    },

    github: {
      checkAuth: vi.fn().mockResolvedValue({ success: true, authenticated: true, account: 'test-user' }),
      createPr: vi.fn().mockResolvedValue({ success: true, number: 1, url: 'https://github.com/test/repo/pull/1' }),
      getPrStatus: vi.fn().mockResolvedValue({ success: true, status: null }),
      getPrComments: vi.fn().mockResolvedValue({ success: true, comments: [] }),
      buildAddressCommentsContext: vi.fn().mockResolvedValue({ success: true, context: '' }),
    },
  };
}

// Type for the mock API
export type MockApi = ReturnType<typeof createMockApi>;

/**
 * Install mock API on window object
 * Call this in beforeEach to set up the mock
 */
export function installMockApi(): MockApi {
  const mockApi = createMockApi();
  (globalThis as unknown as { window: { api: MockApi } }).window = { api: mockApi };
  return mockApi;
}

/**
 * Get the current mock API from window
 * Useful for making assertions on mock calls
 */
export function getMockApi(): MockApi {
  return (globalThis as unknown as { window: { api: MockApi } }).window.api;
}
