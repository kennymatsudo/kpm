/**
 * Confluence Sync Service
 *
 * Reuses Jira credentials since they share the same Atlassian Cloud account.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { AsyncResult, ServiceResult } from '../result';
import { success, failure, wrapAsync } from '../result';
import type {
  IConfluenceLinkRepository,
  ConfluencePageLink,
  SyncState,
} from '../../db/interfaces/confluence';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import { ConfluenceClient } from '../../wiki-clients/confluence';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import { resolveScopedPath } from '../files/scopedFs';
import { resolvePlanRefs } from '../../documents/planRefResolver';

export interface SyncPreview {
  hasConflict: boolean; // Both sides changed since last sync
  localChanged: boolean;
  remoteChanged: boolean;
  localContent: string;
  remoteContent: string;
  remoteVersion: number;
}

export interface ConfluenceSyncServiceDeps {
  confluenceLinks: IConfluenceLinkRepository;
  projects: IProjectRepository;
  /** Used to resolve `@plan/<uuid>` tokens to native Jira smart links on push. */
  planItems: IPlanItemRepository;
}

export function createConfluenceSyncService(deps: ConfluenceSyncServiceDeps) {
  /**
   * Create a Confluence client using Jira credentials.
   * Returns null if no Jira credentials are configured.
   */
  const createClient = async (): Promise<ConfluenceClient | null> => {
    try {
      // Check if Jira credentials exist
      const hasCredentials = await TrackerClientService.hasJiraCredentials();
      if (!hasCredentials) return null;

      // Get credentials directly from keytar (includes API token)
      const { KeytarCredentialProvider } = await import('../../tracker-clients/common/credentials');
      const provider = new KeytarCredentialProvider();
      const credentials = await provider.getCredentials('jira');
      if (!credentials) return null;

      return new ConfluenceClient(credentials);
    } catch {
      return null;
    }
  };

  const getProjectFolder = (projectId: string): string | null => {
    const project = deps.projects.get(projectId);
    return project?.folder_path ?? null;
  };

  const hashContent = (content: string): string => {
    return createHash('sha256').update(content).digest('hex');
  };

  const resolveDocumentPath = (projectFolder: string, documentPath: string): string => {
    const scoped = resolveScopedPath(projectFolder, documentPath);
    if (!scoped.valid) {
      throw new Error('Invalid document path');
    }
    return scoped.fullPath;
  };

  const readLocalDocument = (projectFolder: string, documentPath: string): string | null => {
    const fullPath = resolveDocumentPath(projectFolder, documentPath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
  };

  const writeLocalDocument = (
    projectFolder: string,
    documentPath: string,
    content: string
  ): void => {
    const fullPath = resolveDocumentPath(projectFolder, documentPath);
    writeFileSync(fullPath, content, 'utf-8');
  };

  return {
    /**
     * Link a document to a Confluence page via URL.
     */
    async linkDocument(
      projectId: string,
      documentPath: string,
      confluenceUrl: string
    ): AsyncResult<ConfluencePageLink> {
      return wrapAsync(async () => {
        // Parse URL
        const parsed = ConfluenceClient.parsePageUrl(confluenceUrl);
        if (!parsed) {
          throw new Error('Invalid Confluence URL format');
        }

        const projectFolder = getProjectFolder(projectId);
        if (!projectFolder) {
          throw new Error('Project folder not found');
        }
        resolveDocumentPath(projectFolder, documentPath);

        // Check if already linked
        const existing = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
        if (existing) {
          throw new Error('Document is already linked to a Confluence page');
        }

        const existingPage = deps.confluenceLinks.getByPageId(parsed.pageId);
        if (existingPage) {
          throw new Error('This Confluence page is already linked to another document');
        }

        // Verify page exists and get title
        const client = await createClient();
        if (!client) {
          throw new Error('No Jira credentials configured. Configure Jira to use Confluence sync.');
        }

        const page = await client.getPage(parsed.pageId);

        // Create link
        const link = deps.confluenceLinks.create({
          project_id: projectId,
          document_path: documentPath,
          site_url: parsed.siteUrl,
          space_key: parsed.spaceKey || page.spaceId,
          page_id: parsed.pageId,
          page_title: page.title,
        });

        return link;
      }, 'Failed to link document');
    },

    /**
     * Generate a preview for syncing (either push or pull direction).
     */
    async generateSyncPreview(
      projectId: string,
      documentPath: string
    ): AsyncResult<SyncPreview> {
      return wrapAsync(async () => {
        const link = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
        if (!link) {
          throw new Error('Document is not linked to Confluence');
        }

        const projectFolder = getProjectFolder(projectId);
        if (!projectFolder) {
          throw new Error('Project folder not found');
        }

        const client = await createClient();
        if (!client) {
          throw new Error('No credentials configured');
        }

        // Get current content from both sides
        const localContent = readLocalDocument(projectFolder, documentPath) ?? '';
        const page = await client.getPage(link.page_id);
        const remoteContent = page.content;

        // Check what changed since last sync
        const localHash = hashContent(localContent);
        const remoteHash = hashContent(remoteContent);

        // Determine if this is initial sync (never synced before)
        const isInitialSync =
          link.local_content_hash === null && link.remote_content_hash === null;

        // For initial sync, compare current content directly
        // For subsequent syncs, compare against last known state
        const localChanged = isInitialSync
          ? false // Can't detect "changes" without baseline
          : localHash !== link.local_content_hash;
        const remoteChanged = isInitialSync
          ? false // Can't detect "changes" without baseline
          : remoteHash !== link.remote_content_hash;

        // Content differs between local and remote (regardless of sync history)
        const hasContentDifference = localHash !== remoteHash;

        return {
          hasConflict: localChanged && remoteChanged,
          localChanged,
          remoteChanged,
          isInitialSync,
          hasContentDifference,
          localContent,
          remoteContent,
          remoteVersion: page.version,
        };
      }, 'Failed to generate sync preview');
    },

    /**
     * Push local document to Confluence.
     */
    async executePush(
      projectId: string,
      documentPath: string
    ): AsyncResult<{ pageUrl: string }> {
      return wrapAsync(async () => {
        const link = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
        if (!link) {
          throw new Error('Document is not linked to Confluence');
        }

        const projectFolder = getProjectFolder(projectId);
        if (!projectFolder) {
          throw new Error('Project folder not found');
        }

        const client = await createClient();
        if (!client) {
          throw new Error('No credentials configured');
        }

        // Read local content
        const localContent = readLocalDocument(projectFolder, documentPath);
        if (localContent === null) {
          throw new Error('Local document not found');
        }

        // Resolve @plan/<uuid> refs to native Jira smart-link markdown so the
        // Confluence page renders issue cards instead of literal tokens.
        const projectPlanItems = deps.planItems.getByProject(projectId);
        const resolvedContent = resolvePlanRefs(localContent, projectPlanItems, 'confluence');

        // Get current remote version
        const currentPage = await client.getPage(link.page_id);

        // Update Confluence
        const updatedPage = await client.updatePage(
          link.page_id,
          resolvedContent,
          currentPage.version
        );

        // Update sync state
        const syncState: SyncState = {
          last_synced_at: new Date().toISOString(),
          local_content_hash: hashContent(localContent),
          remote_content_hash: hashContent(updatedPage.content),
          remote_version: updatedPage.version,
        };
        deps.confluenceLinks.updateSyncState(link.id, syncState);
        deps.confluenceLinks.updatePageTitle(link.id, updatedPage.title);

        return { pageUrl: `https://${link.site_url}${updatedPage.webUrl}` };
      }, 'Failed to push to Confluence');
    },

    /**
     * Pull content from Confluence to local document.
     */
    async executePull(projectId: string, documentPath: string): AsyncResult<void> {
      return wrapAsync(async () => {
        const link = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
        if (!link) {
          throw new Error('Document is not linked to Confluence');
        }

        const projectFolder = getProjectFolder(projectId);
        if (!projectFolder) {
          throw new Error('Project folder not found');
        }

        const client = await createClient();
        if (!client) {
          throw new Error('No credentials configured');
        }

        // Fetch from Confluence
        const page = await client.getPage(link.page_id);

        // Write to local file
        writeLocalDocument(projectFolder, documentPath, page.content);

        // Update sync state
        const syncState: SyncState = {
          last_synced_at: new Date().toISOString(),
          local_content_hash: hashContent(page.content),
          remote_content_hash: hashContent(page.content),
          remote_version: page.version,
        };
        deps.confluenceLinks.updateSyncState(link.id, syncState);
        deps.confluenceLinks.updatePageTitle(link.id, page.title);
      }, 'Failed to pull from Confluence');
    },

    /**
     * Remove link between document and Confluence page.
     */
    unlinkDocument(projectId: string, documentPath: string): ServiceResult<void> {
      const link = deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
      if (!link) {
        return failure('Document is not linked to Confluence');
      }
      deps.confluenceLinks.delete(link.id);
      return success(undefined);
    },

    /**
     * Get all links for a project.
     */
    getLinksForProject(projectId: string): ConfluencePageLink[] {
      return deps.confluenceLinks.getByProject(projectId);
    },

    /**
     * Get a specific link by document path.
     */
    getLinkForDocument(
      projectId: string,
      documentPath: string
    ): ConfluencePageLink | null {
      return deps.confluenceLinks.getByDocumentPath(projectId, documentPath);
    },

    /**
     * Check if a document is linked.
     */
    isDocumentLinked(projectId: string, documentPath: string): boolean {
      return deps.confluenceLinks.getByDocumentPath(projectId, documentPath) !== null;
    },

    /**
     * Parse a Confluence URL without making API calls.
     * Useful for URL validation before linking.
     */
    parseUrl(url: string): { siteUrl: string; spaceKey: string; pageId: string } | null {
      return ConfluenceClient.parsePageUrl(url);
    },
  };
}

export type ConfluenceSyncService = ReturnType<typeof createConfluenceSyncService>;
