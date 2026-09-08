/**
 * Confluence document sync: linking a local markdown file to a Confluence page,
 * and the Confluence wiring for the shared two-way sync algorithm.
 */

import type { AsyncResult, ServiceResult } from '../result';
import { wrapAsync } from '../result';
import type {
  IConfluenceLinkRepository,
  ConfluencePageLink,
} from '../../db/interfaces/confluence';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import { ConfluenceClient } from '../../wiki-clients/confluence';
import {
  createDocumentSyncService,
  createProjectFolderDocumentStore,
  type DocumentSyncPreview,
} from '../documentSync';
import {
  createConfluenceClient,
  createConfluenceDocumentStore,
  createConfluenceLinkStore,
} from './confluenceStores';

export type SyncPreview = DocumentSyncPreview;

export interface ConfluenceSyncServiceDeps {
  confluenceLinks: IConfluenceLinkRepository;
  projects: IProjectRepository;
  /** Used to resolve `@plan/<uuid>` tokens to native Jira smart links on push. */
  planItems: IPlanItemRepository;
}

export function createConfluenceSyncService(deps: ConfluenceSyncServiceDeps) {
  const local = createProjectFolderDocumentStore(deps.projects);
  const sync = createDocumentSyncService({
    links: createConfluenceLinkStore(deps.confluenceLinks),
    local,
    remote: createConfluenceDocumentStore,
    planItems: deps.planItems,
    destination: 'confluence',
    label: 'Confluence',
  });

  return {
    async linkDocument(
      projectId: string,
      documentPath: string,
      confluenceUrl: string
    ): AsyncResult<ConfluencePageLink> {
      return wrapAsync(async () => {
        const parsed = ConfluenceClient.parsePageUrl(confluenceUrl);
        if (!parsed) {
          throw new Error('Invalid Confluence URL format');
        }

        local.open(projectId, documentPath);

        if (deps.confluenceLinks.getByDocumentPath(projectId, documentPath)) {
          throw new Error('Document is already linked to a Confluence page');
        }
        if (deps.confluenceLinks.getByPageId(parsed.pageId)) {
          throw new Error('This Confluence page is already linked to another document');
        }

        const client = await createConfluenceClient();
        if (!client) {
          throw new Error('No Jira credentials configured. Configure Jira to use Confluence sync.');
        }

        const page = await client.getPage(parsed.pageId);

        return deps.confluenceLinks.create({
          project_id: projectId,
          document_path: documentPath,
          site_url: parsed.siteUrl,
          space_key: parsed.spaceKey || page.spaceId,
          page_id: parsed.pageId,
          page_title: page.title,
        });
      }, 'Failed to link document');
    },

    generateSyncPreview(projectId: string, documentPath: string): AsyncResult<SyncPreview> {
      return sync.generateSyncPreview(projectId, documentPath);
    },

    async executePush(
      projectId: string,
      documentPath: string,
      syncReceipt: string
    ): AsyncResult<{ pageUrl: string }> {
      const result = await sync.executePush(projectId, documentPath, syncReceipt);
      if (!result.ok) return result;

      const link = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
      return { ok: true, data: { pageUrl: `https://${link?.site_url ?? ''}${result.data.url}` } };
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

    getLinksForProject(projectId: string): ConfluencePageLink[] {
      return deps.confluenceLinks.getByProject(projectId);
    },

    getLinkForDocument(projectId: string, documentPath: string): ConfluencePageLink | null {
      return deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
    },

    isDocumentLinked(projectId: string, documentPath: string): boolean {
      return deps.confluenceLinks.getByDocumentPath(projectId, documentPath) !== null;
    },

    parseUrl(url: string): { siteUrl: string; spaceKey: string; pageId: string } | null {
      return ConfluenceClient.parsePageUrl(url);
    },
  };
}

export type ConfluenceSyncService = ReturnType<typeof createConfluenceSyncService>;
