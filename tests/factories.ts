/**
 * Test Data Factories
 *
 * Factory functions for creating test data with sensible defaults.
 * Use these to create consistent test fixtures across all tests.
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { createTestDatabase } from './mocks/database';
import { createRepositoryContainer } from '../src/main/db/container';
import type { IRepositoryContainer } from '../src/main/db/interfaces';
import type { IFileSystem, IPathUtils } from '../src/main/db/repositories/impl/ProjectRepository';
import type {
  Project,
  PlanItem,
  PlanRelation,
  Repo,
  Attachment,
  TrackerConnection,
  TrackerProjectScope,
  TrackerAssociation,
  TrackerAssociationWithScope,
  TrackerTypeMapping,
  SyncSnapshot,
  SyncNewItem,
  SyncUpdatedItem,
  SyncConflict,
  SyncPreview,
  StatusCategory,
} from '../src/shared/types';

// =============================================================================
// Project Factory
// =============================================================================

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  folder_path?: string;
  phase?: 'discovery' | 'high_level' | 'detailed' | 'ready';
  session_tokens?: number;
  session_input_tokens?: number;
  session_output_tokens?: number;
}

export function createProject(options: CreateProjectOptions = {}): Project {
  const id = options.id ?? randomUUID();
  return {
    id,
    name: options.name ?? 'Test Project',
    folder_path: options.folder_path ?? `/tmp/projects/${id}`,
    phase: options.phase ?? 'discovery',
    session_tokens: options.session_tokens ?? 0,
    session_input_tokens: options.session_input_tokens ?? 0,
    session_output_tokens: options.session_output_tokens ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// =============================================================================
// Plan Item Factory
// =============================================================================

export interface CreatePlanItemOptions {
  id?: string;
  project_id?: string;
  parent_id?: string | null;
  title?: string;
  description?: string | null;
  intent?: string | null;
  acceptance_criteria?: string[] | null;
  source_document_id?: string | null;
  label?: 'project' | 'feature' | 'task' | null;
  item_order?: number;
  code_refs?: string[] | null;
  status?: 'planned';
  release_tag?: string | null;
  position_x?: number | null;
  position_y?: number | null;
  // External tracker fields
  association_id?: string | null;
  external_key?: string | null;
  external_id?: string | null;
  external_type?: 'jira' | 'linear' | null;
  external_issue_type?: string | null;
  external_status?: string | null;
  status_category?: StatusCategory | null;
  external_url?: string | null;
  external_parent_key?: string | null;
  external_epic_key?: string | null;
  sync_source?: 'local' | 'jira' | 'linear';
  last_synced_at?: string | null;
}

export function createPlanItem(options: CreatePlanItemOptions = {}): PlanItem {
  return {
    id: options.id ?? randomUUID(),
    project_id: options.project_id,
    parent_id: options.parent_id ?? null,
    group_id: null,
    title: options.title ?? 'Test Plan Item',
    description: options.description ?? null,
    label: options.label ?? null,
    item_order: options.item_order ?? 0,
    code_refs: options.code_refs ?? null,
    status: options.status ?? 'planned',
    release_tag: options.release_tag ?? null,
    position_x: options.position_x ?? null,
    position_y: options.position_y ?? null,
    association_id: options.association_id ?? null,
    external_key: options.external_key ?? null,
    external_id: options.external_id ?? null,
    external_type: options.external_type ?? null,
    external_issue_type: options.external_issue_type ?? null,
    external_status: options.external_status ?? null,
    status_category: options.status_category ?? null,
    external_url: options.external_url ?? null,
    external_parent_key: options.external_parent_key ?? null,
    external_epic_key: options.external_epic_key ?? null,
    sync_source: options.sync_source ?? 'local',
    last_synced_at: options.last_synced_at ?? null,
    intent: options.intent ?? null,
    acceptance_criteria: options.acceptance_criteria ?? null,
    source_document_id: options.source_document_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Create a plan item that's linked to Jira
 */
export function createJiraPlanItem(
  jiraKey: string,
  options: Omit<CreatePlanItemOptions, 'external_key' | 'external_type'> = {}
): PlanItem {
  return createPlanItem({
    ...options,
    external_key: jiraKey,
    external_type: 'jira',
    external_url: `https://test.atlassian.net/browse/${jiraKey}`,
    sync_source: 'jira',
  });
}

// =============================================================================
// Relation Factory
// =============================================================================

export interface CreateRelationOptions {
  id?: string;
  project_id: string;
  from_item_id: string;
  to_item_id: string;
  relation_type?: 'depends_on' | 'blocks' | 'relates_to';
}

export function createRelation(options: CreateRelationOptions): PlanRelation {
  return {
    id: options.id ?? randomUUID(),
    project_id: options.project_id,
    from_item_id: options.from_item_id,
    to_item_id: options.to_item_id,
    relation_type: options.relation_type ?? 'depends_on',
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// Tracker Factories
// =============================================================================

export function createTrackerConnection(
  options: Partial<TrackerConnection> = {}
): TrackerConnection {
  return {
    id: options.id ?? randomUUID(),
    tracker_type: options.tracker_type ?? 'jira',
    site_url: options.site_url ?? 'test.atlassian.net',
    display_name: options.display_name ?? null,
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

export function createTrackerProjectScope(
  options: Partial<TrackerProjectScope> & { connection_id: string }
): TrackerProjectScope {
  return {
    id: options.id ?? randomUUID(),
    connection_id: options.connection_id,
    project_key: options.project_key ?? 'TEST',
    project_name: options.project_name ?? 'Test Project',
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

export function createTrackerAssociation(
  options: Partial<TrackerAssociation> & { kpm_project_id: string; scope_id: string }
): TrackerAssociation {
  return {
    id: options.id ?? randomUUID(),
    kpm_project_id: options.kpm_project_id,
    scope_id: options.scope_id,
    issue_filter: options.issue_filter ?? 'project = TEST',
    display_name: options.display_name ?? null,
    status_mapping: options.status_mapping ?? null,
    custom_field_values: options.custom_field_values ?? null,
    epic_key: options.epic_key ?? null,
    last_synced_at: options.last_synced_at ?? null,
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

export function createTrackerAssociationWithScope(
  options: Partial<TrackerAssociationWithScope> & { kpm_project_id: string; scope_id: string }
): TrackerAssociationWithScope {
  const base = createTrackerAssociation(options);
  return {
    ...base,
    tracker_type: options.tracker_type ?? 'jira',
    project_key: options.project_key ?? 'TEST',
    project_name: options.project_name ?? 'Test Project',
    site_url: options.site_url ?? 'test.atlassian.net',
  };
}

// =============================================================================
// Sync Factories
// =============================================================================

export function createSyncSnapshot(
  options: Partial<SyncSnapshot> & { plan_item_id: string }
): SyncSnapshot {
  return {
    id: options.id ?? randomUUID(),
    plan_item_id: options.plan_item_id,
    snapshot_title: options.snapshot_title ?? null,
    snapshot_description: options.snapshot_description ?? null,
    snapshot_label: options.snapshot_label ?? null,
    snapshot_release_tag: options.snapshot_release_tag ?? null,
    external_updated_at: options.external_updated_at ?? null,
    snapshot_at: options.snapshot_at ?? new Date().toISOString(),
  };
}

export function createSyncNewItem(options: Partial<SyncNewItem> = {}): SyncNewItem {
  return {
    external_key: options.external_key ?? 'TEST-123',
    title: options.title ?? 'New Issue from Jira',
    description: options.description ?? null,
    label: options.label ?? null,
    external_issue_type: options.external_issue_type ?? 'Story',
    external_status: options.external_status ?? 'To Do',
    status_category: options.status_category ?? 'not_started',
    external_url: options.external_url ?? 'https://jira.example.com/browse/TEST-123',
    external_parent_key: options.external_parent_key ?? null,
    external_epic_key: options.external_epic_key ?? null,
  };
}

export function createSyncUpdatedItem(
  options: Partial<SyncUpdatedItem> & { plan_item_id: string }
): SyncUpdatedItem {
  return {
    plan_item_id: options.plan_item_id,
    external_key: options.external_key ?? 'TEST-123',
    title: options.title ?? 'Updated Item',
    changes: options.changes ?? [],
  };
}

export function createSyncConflict(
  options: Partial<SyncConflict> & { plan_item_id: string }
): SyncConflict {
  return {
    plan_item_id: options.plan_item_id,
    external_key: options.external_key ?? 'TEST-123',
    title: options.title ?? 'Conflicting Item',
    fields: options.fields ?? [],
  };
}

export function createSyncPreview(options: Partial<SyncPreview> = {}): SyncPreview {
  return {
    tracker_type: options.tracker_type ?? 'jira',
    link_id: options.link_id ?? randomUUID(),
    external_project_key: options.external_project_key ?? 'TEST',
    new_items: options.new_items ?? [],
    updated_items: options.updated_items ?? [],
    conflicts: options.conflicts ?? [],
    deleted_in_tracker: options.deleted_in_tracker ?? [],
    stats: options.stats ?? {
      total: 0,
      new: 0,
      updated: 0,
      conflicts: 0,
      deleted: 0,
      unchanged: 0,
    },
  };
}

// =============================================================================
// Utility Factories
// =============================================================================

export function createRepo(
  options: Partial<Repo> & { project_id: string }
): Repo {
  return {
    id: options.id ?? randomUUID(),
    project_id: options.project_id,
    path: options.path ?? '/tmp/test-repo',
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

export function createAttachment(
  options: Partial<Attachment> & { project_id: string }
): Attachment {
  return {
    id: options.id ?? randomUUID(),
    project_id: options.project_id,
    path: options.path ?? '/tmp/attachments/test.pdf',
    filename: options.filename ?? 'test.pdf',
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

export function createTrackerTypeMapping(
  options: Partial<TrackerTypeMapping> & { kpm_project_id: string; scope_id: string }
): TrackerTypeMapping {
  return {
    id: options.id ?? randomUUID(),
    kpm_project_id: options.kpm_project_id,
    scope_id: options.scope_id,
    kpm_label: options.kpm_label ?? 'task',
    tracker_issue_type_id: options.tracker_issue_type_id ?? '10001',
    tracker_issue_type_name: options.tracker_issue_type_name ?? 'Task',
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

// =============================================================================
// Repository Test Context
// =============================================================================

/**
 * Mock file system for testing ProjectRepository
 * Tracks all file operations without touching real filesystem
 */
export function createMockFileSystem(): IFileSystem & {
  createdDirs: string[];
  writtenFiles: Map<string, string>;
  deletedPaths: string[];
  symlinkedFiles: Map<string, string>;
} {
  const createdDirs: string[] = [];
  const writtenFiles = new Map<string, string>();
  const deletedPaths: string[] = [];
  const symlinkedFiles = new Map<string, string>();

  return {
    createdDirs,
    writtenFiles,
    deletedPaths,
    symlinkedFiles,
    existsSync: (path: string) => createdDirs.includes(path) || writtenFiles.has(path) || symlinkedFiles.has(path),
    mkdirSync: (path: string) => { createdDirs.push(path); },
    writeFileSync: (path: string, content: string) => { writtenFiles.set(path, content); },
    rmSync: (path: string) => { deletedPaths.push(path); },
    unlinkSync: (path: string) => {
      deletedPaths.push(path);
      writtenFiles.delete(path);
      symlinkedFiles.delete(path);
    },
    symlinkSync: (target: string, path: string) => { symlinkedFiles.set(path, target); },
  };
}

/**
 * Mock path utilities for testing
 */
export function createMockPathUtils(): IPathUtils {
  return {
    join: (...paths: string[]) => paths.join('/'),
  };
}

/**
 * Context object for repository tests
 * Provides database, repositories, and mock helpers
 */
export interface TestRepositoryContext {
  db: Database;
  repos: IRepositoryContainer;
  mockFs: ReturnType<typeof createMockFileSystem>;
  mockPath: IPathUtils;
  userDataPath: string;
}

/**
 * Create a complete test context with in-memory database and DI-wired repositories
 *
 * Usage:
 * ```ts
 * const ctx = createTestRepositoryContext();
 * const project = ctx.repos.projects.create({ name: 'My Project' });
 * expect(ctx.mockFs.createdDirs).toContain(project.folder_path);
 * ```
 */
export function createTestRepositoryContext(): TestRepositoryContext {
  const db = createTestDatabase();
  const mockFs = createMockFileSystem();
  const mockPath = createMockPathUtils();
  const userDataPath = '/tmp/test-userdata';

  const repos = createRepositoryContainer({
    database: db,
    userDataPath,
    fileSystem: mockFs,
    pathUtils: mockPath,
  });

  return { db, repos, mockFs, mockPath, userDataPath };
}
