/**
 * Confluence Link Repository Interface
 *
 */

export interface ConfluencePageLink {
  id: string;
  project_id: string;
  document_path: string;
  site_url: string;
  space_key: string;
  page_id: string;
  page_title: string | null;
  last_synced_at: string | null;
  local_content_hash: string | null;
  remote_content_hash: string | null;
  remote_version: number | null;
  created_at: string;
}

export interface SyncState {
  last_synced_at: string;
  local_content_hash: string;
  remote_content_hash: string;
  remote_version: number;
}

export interface ConfluenceLinkCreate {
  project_id: string;
  document_path: string;
  site_url: string;
  space_key: string;
  page_id: string;
  page_title: string | null;
}

export interface IConfluenceLinkRepository {
  getByProject(projectId: string): ConfluencePageLink[];
  getByDocumentPath(projectId: string, documentPath: string): ConfluencePageLink | null;
  getByPageId(pageId: string): ConfluencePageLink | null;
  get(id: string): ConfluencePageLink | null;
  create(link: ConfluenceLinkCreate): ConfluencePageLink;
  updateSyncState(id: string, state: SyncState): void;
  updatePageTitle(id: string, title: string): void;
  delete(id: string): void;
}
