import type { ExternalMarkdown } from '../../documents/exportBoundary';
import type { SyncDirection } from '../../../shared/types';

export type { SyncDirection } from '../../../shared/types';

export interface RemoteDocument {
  id: string;
  title: string;
  content: string;
  revision: number;
  url: string;
}

export interface RemoteDocumentStore {
  read(remoteId: string): Promise<RemoteDocument>;
  write(
    remoteId: string,
    content: ExternalMarkdown,
    expectedRevision: number,
  ): Promise<RemoteDocument>;
}

export type RemoteDocumentStoreFactory = () => Promise<RemoteDocumentStore | null>;

export interface LocalDocument {
  read(): string | null;
  write(content: string): void;
}

export interface LocalDocumentStore {
  open(projectId: string, documentPath: string): LocalDocument;
}

export interface DocumentSyncState {
  last_synced_at: string;
  local_content_hash: string;
  remote_content_hash: string;
  remote_version: number;
}

export interface SyncedDocument {
  linkId: string;
  remoteId: string;
  direction: SyncDirection;
  localContentHash: string | null;
  remoteContentHash: string | null;
}

export interface DocumentLinkStore {
  find(projectId: string, documentPath: string): SyncedDocument | null;
  saveSyncState(linkId: string, state: DocumentSyncState): void;
  saveRemoteTitle(linkId: string, title: string): void;
  remove(linkId: string): void;
}

export interface DocumentSyncPreview {
  hasConflict: boolean;
  localChanged: boolean;
  remoteChanged: boolean;
  isInitialSync: boolean;
  hasContentDifference: boolean;
  localContent: string;
  remoteContent: string;
  remoteVersion: number;
  pushReceipt: string;
  pullReceipt: string;
}

export class StaleContentError extends Error {}
