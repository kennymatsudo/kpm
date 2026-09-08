import { createHash, randomUUID } from 'crypto';
import type { AsyncResult, ServiceResult } from '../result';
import { success, failure } from '../result';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import {
  fromExternalMarkdown,
  toExternalMarkdown,
  type ExternalDestination,
} from '../../documents/exportBoundary';
import { StaleContentError } from './types';
import type {
  DocumentLinkStore,
  DocumentSyncPreview,
  DocumentSyncState,
  LocalDocumentStore,
  RemoteDocument,
  RemoteDocumentStoreFactory,
} from './types';

export interface DocumentSyncDeps {
  links: DocumentLinkStore;
  local: LocalDocumentStore;
  remote: RemoteDocumentStoreFactory;
  planItems: IPlanItemRepository;
  destination: ExternalDestination;
  label: string;
  now?: () => number;
}

type SyncAction = 'push' | 'pull';

interface SyncReceipt {
  projectId: string;
  documentPath: string;
  action: SyncAction;
  expectedContentHash: string;
  expiresAt: number;
}

const SYNC_RECEIPT_LIFETIME_MS = 5 * 60 * 1000;

export function createDocumentSyncService(deps: DocumentSyncDeps) {
  const now = deps.now ?? Date.now;
  const receipts = new Map<string, SyncReceipt>();
  const hashContent = (content: string): string =>
    createHash('sha256').update(content).digest('hex');

  const run = async <T>(fn: () => Promise<T>, fallback: string): AsyncResult<T> => {
    try {
      return success(await fn());
    } catch (e) {
      if (e instanceof StaleContentError) return failure(e.message);
      console.error('[DocumentSync]', fallback, e);
      return failure(fallback);
    }
  };

  const requireLink = (projectId: string, documentPath: string) => {
    const link = deps.links.find(projectId, documentPath);
    if (!link) throw new Error(`Document is not linked to ${deps.label}`);
    return link;
  };

  const requireRemote = async () => {
    const remote = await deps.remote();
    if (!remote) throw new Error('No credentials configured');
    return remote;
  };

  const createReceipt = (
    projectId: string,
    documentPath: string,
    action: SyncAction,
    expectedContentHash: string,
  ): string => {
    const receipt = randomUUID();
    receipts.set(receipt, {
      projectId,
      documentPath,
      action,
      expectedContentHash,
      expiresAt: now() + SYNC_RECEIPT_LIFETIME_MS,
    });
    return receipt;
  };

  const consumeReceipt = (
    receipt: string,
    projectId: string,
    documentPath: string,
    action: SyncAction,
  ): string => {
    const preview = receipts.get(receipt);
    receipts.delete(receipt);
    if (
      !preview ||
      preview.expiresAt <= now() ||
      preview.projectId !== projectId ||
      preview.documentPath !== documentPath ||
      preview.action !== action
    ) {
      throw new StaleContentError(
        'This sync preview is no longer valid. Review the differences again before continuing.',
      );
    }
    return preview.expectedContentHash;
  };

  const recordSync = (
    linkId: string,
    localContent: string,
    remoteDocument: RemoteDocument,
  ): void => {
    const state: DocumentSyncState = {
      last_synced_at: new Date().toISOString(),
      local_content_hash: hashContent(localContent),
      remote_content_hash: hashContent(remoteDocument.content),
      remote_version: remoteDocument.revision,
    };
    deps.links.saveSyncState(linkId, state);
    deps.links.saveRemoteTitle(linkId, remoteDocument.title);
  };

  return {
    async generateSyncPreview(
      projectId: string,
      documentPath: string,
    ): AsyncResult<DocumentSyncPreview> {
      return run(async () => {
        const link = requireLink(projectId, documentPath);
        const document = deps.local.open(projectId, documentPath);
        const remote = await requireRemote();

        const localContent = document.read() ?? '';
        const remoteDocument = await remote.read(link.remoteId);

        const localHash = hashContent(localContent);
        const remoteHash = hashContent(remoteDocument.content);

        const isInitialSync =
          link.localContentHash === null && link.remoteContentHash === null;
        const localChanged = isInitialSync ? false : localHash !== link.localContentHash;
        const remoteChanged = isInitialSync ? false : remoteHash !== link.remoteContentHash;

        return {
          hasConflict: localChanged && remoteChanged,
          localChanged,
          remoteChanged,
          isInitialSync,
          hasContentDifference: localHash !== remoteHash,
          localContent,
          remoteContent: remoteDocument.content,
          remoteVersion: remoteDocument.revision,
          pushReceipt: createReceipt(projectId, documentPath, 'push', remoteHash),
          pullReceipt: createReceipt(projectId, documentPath, 'pull', localHash),
        };
      }, 'Failed to generate sync preview');
    },

    async executePush(
      projectId: string,
      documentPath: string,
      syncReceipt: string,
    ): AsyncResult<RemoteDocument> {
      return run(async () => {
        const link = requireLink(projectId, documentPath);
        const document = deps.local.open(projectId, documentPath);
        const remote = await requireRemote();
        const expectedRemoteHash = consumeReceipt(syncReceipt, projectId, documentPath, 'push');

        const localContent = document.read();
        if (localContent === null) throw new Error('Local document not found');

        const current = await remote.read(link.remoteId);
        if (hashContent(current.content) !== expectedRemoteHash) {
          throw new StaleContentError(
            `The ${deps.label} copy changed while you were looking at it. Review the differences again before pushing.`
          );
        }

        const resolved = toExternalMarkdown(
          localContent,
          deps.planItems.getByProject(projectId),
          deps.destination,
        );
        const written = await remote.write(link.remoteId, resolved, current.revision);
        recordSync(link.linkId, localContent, written);
        return written;
      }, `Failed to push to ${deps.label}`);
    },

    async executePull(
      projectId: string,
      documentPath: string,
      syncReceipt: string,
    ): AsyncResult<void> {
      return run(async () => {
        const link = requireLink(projectId, documentPath);
        if (link.direction === 'push-only') {
          throw new Error(`This document is published to ${deps.label} one way; pulling would overwrite the local copy that owns it`);
        }
        const document = deps.local.open(projectId, documentPath);
        const remote = await requireRemote();
        const expectedLocalHash = consumeReceipt(syncReceipt, projectId, documentPath, 'pull');

        if (hashContent(document.read() ?? '') !== expectedLocalHash) {
          throw new StaleContentError(
            'The local file changed while you were looking at it. Review the differences again before pulling.'
          );
        }

        const remoteDocument = await remote.read(link.remoteId);
        const localContent = fromExternalMarkdown(
          remoteDocument.content,
          deps.planItems.getByProject(projectId),
          deps.destination,
        );
        document.write(localContent);
        recordSync(link.linkId, localContent, remoteDocument);
      }, `Failed to pull from ${deps.label}`);
    },

    unlinkDocument(projectId: string, documentPath: string): ServiceResult<void> {
      const link = deps.links.find(projectId, documentPath);
      if (!link) return failure(`Document is not linked to ${deps.label}`);
      deps.links.remove(link.linkId);
      return success(undefined);
    },
  };
}

export type DocumentSyncService = ReturnType<typeof createDocumentSyncService>;
