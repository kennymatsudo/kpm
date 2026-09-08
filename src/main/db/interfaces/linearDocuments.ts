/**
 * Linear Document Link Repository Interface
 *
 * Links KPM documents to Linear Documents for two-way sync.
 */

import type { SyncDirection } from '../../../shared/types';

export interface LinearDocumentLink {
  id: string;
  project_id: string;
  document_path: string;
  linear_document_id: string;
  slug_id: string | null;
  document_title: string | null;
  document_url: string | null;
  parent_kind: 'project' | 'issue';
  parent_id: string;
  direction: SyncDirection;
  last_synced_at: string | null;
  local_content_hash: string | null;
  remote_content_hash: string | null;
  remote_version: number | null;
  created_at: string;
}

export interface LinearDocumentLinkCreate {
  project_id: string;
  document_path: string;
  linear_document_id: string;
  slug_id: string | null;
  document_title: string | null;
  document_url: string | null;
  parent_kind: 'project' | 'issue';
  parent_id: string;
  direction: SyncDirection;
}

export interface LinearDocumentSyncState {
  last_synced_at: string;
  local_content_hash: string;
  remote_content_hash: string;
  remote_version: number;
}

export interface ILinearDocumentLinkRepository {
  getByProject(projectId: string): LinearDocumentLink[];
  getByDocumentPath(projectId: string, documentPath: string): LinearDocumentLink | null;
  getByDocumentId(linearDocumentId: string): LinearDocumentLink | null;
  create(link: LinearDocumentLinkCreate): LinearDocumentLink;
  updateSyncState(id: string, state: LinearDocumentSyncState): void;
  updateTitle(id: string, title: string): void;
  updateDirection(id: string, direction: SyncDirection): void;
  delete(id: string): void;
}
