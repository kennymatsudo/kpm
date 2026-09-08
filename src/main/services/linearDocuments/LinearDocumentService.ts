import { createHash } from 'crypto';
import type { AsyncResult, ServiceResult } from '../result';
import { wrapAsync } from '../result';
import type {
  ILinearDocumentLinkRepository,
  LinearDocumentLink,
} from '../../db/interfaces/linearDocuments';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import { toExternalMarkdown } from '../../documents/exportBoundary';
import {
  createDocumentSyncService,
  createProjectFolderDocumentStore,
  type DocumentSyncPreview,
  type SyncDirection,
} from '../documentSync';
import {
  createLinearDocumentStore,
  createLinearLinkStore,
  resolveLinearDocumentApi,
  toRemoteDocument,
  type LinearDocumentApi,
} from './linearStores';

export interface PublishTarget {
  kind: 'project' | 'issue';
  id: string;
}

export interface LinearDocumentServiceDeps {
  linearDocumentLinks: ILinearDocumentLinkRepository;
  projects: IProjectRepository;
  planItems: IPlanItemRepository;
  api?: () => Promise<LinearDocumentApi | null>;
}

export function createLinearDocumentService(deps: LinearDocumentServiceDeps) {
  const local = createProjectFolderDocumentStore(deps.projects);
  const resolveApi = deps.api ?? resolveLinearDocumentApi;
  const sync = createDocumentSyncService({
    links: createLinearLinkStore(deps.linearDocumentLinks),
    local,
    remote: async () => {
      const api = await resolveApi();
      return api ? createLinearDocumentStore(api) : null;
    },
    planItems: deps.planItems,
    destination: 'linear',
    label: 'Linear',
  });

  return {
    async publishDocument(
      projectId: string,
      documentPath: string,
      target: PublishTarget,
      title: string,
      direction: SyncDirection,
      documentId: string,
    ): AsyncResult<LinearDocumentLink> {
      return wrapAsync(async () => {
        const document = local.open(projectId, documentPath);

        if (deps.linearDocumentLinks.getByDocumentPath(projectId, documentPath)) {
          throw new Error('Document is already published to Linear');
        }

        const localContent = document.read();
        if (localContent === null) throw new Error('Local document not found');

        const api = await resolveApi();
        if (!api) throw new Error('No credentials configured');

        const content = toExternalMarkdown(
          localContent,
          deps.planItems.getByProject(projectId),
          'linear'
        );
        const created = toRemoteDocument(
          await api.createDocument({
            id: documentId,
            title,
            content,
            ...(target.kind === 'project' ? { projectId: target.id } : { issueId: target.id }),
          })
        );

        const link = deps.linearDocumentLinks.create({
          project_id: projectId,
          document_path: documentPath,
          linear_document_id: created.id,
          slug_id: null,
          document_title: created.title,
          document_url: created.url,
          parent_kind: target.kind,
          parent_id: target.id,
          direction,
        });

        deps.linearDocumentLinks.updateSyncState(link.id, {
          last_synced_at: new Date().toISOString(),
          local_content_hash: hashContent(localContent),
          remote_content_hash: hashContent(created.content),
          remote_version: created.revision,
        });

        return deps.linearDocumentLinks.getByDocumentPath(projectId, documentPath) ?? link;
      }, 'Failed to publish document to Linear');
    },

    generateSyncPreview(projectId: string, documentPath: string): AsyncResult<DocumentSyncPreview> {
      return sync.generateSyncPreview(projectId, documentPath);
    },

    async executePush(
      projectId: string,
      documentPath: string,
      syncReceipt: string
    ): AsyncResult<{ documentUrl: string }> {
      const result = await sync.executePush(projectId, documentPath, syncReceipt);
      if (!result.ok) return result;
      return { ok: true, data: { documentUrl: result.data.url } };
    },

    executePull(
      projectId: string,
      documentPath: string,
      syncReceipt: string
    ): AsyncResult<void> {
      return sync.executePull(projectId, documentPath, syncReceipt);
    },

    unlinkDocument(projectId: string, documentPath: string): ServiceResult<void> {
      return sync.unlinkDocument(projectId, documentPath);
    },

    setDirection(
      projectId: string,
      documentPath: string,
      direction: SyncDirection
    ): ServiceResult<void> {
      const link = deps.linearDocumentLinks.getByDocumentPath(projectId, documentPath);
      if (!link) return { ok: false, error: 'Document is not published to Linear' };
      deps.linearDocumentLinks.updateDirection(link.id, direction);
      return { ok: true, data: undefined };
    },

    getLinksForProject(projectId: string): LinearDocumentLink[] {
      return deps.linearDocumentLinks.getByProject(projectId);
    },

    getLinkForDocument(projectId: string, documentPath: string): LinearDocumentLink | null {
      return deps.linearDocumentLinks.getByDocumentPath(projectId, documentPath);
    },
  };
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export type LinearDocumentService = ReturnType<typeof createLinearDocumentService>;
