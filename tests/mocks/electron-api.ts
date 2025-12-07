/**
 * Mock implementation of the window.api object
 *
 * Use this to mock IPC calls in renderer tests.
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
  TrackerAssociationWithScope,
  SyncQueueEntryWithPlanItem,
  TrackerTypeMapping,
  ExportPreview,
  ExportResult,
  SyncPreview,
  SyncResult,
  ImportPreview,
  ImportResult,
} from '../../src/shared/types';


// =============================================================================
// Mock API Implementation
// =============================================================================

export function createMockApi() {
  return {
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
