/**
 * SearchService - Global search across project entities.
 *
 * FTS5-backed global search. Document entries are indexed from filesystem
 * (all `.md`/`.mdx` files under the project folder, recursively) into `global_search_index`.
 */

import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { subscribe, type AsyncSubscription } from '@parcel/watcher';
import type { Database } from 'better-sqlite3';
import type { AsyncResult } from '../result';
import { success, failure } from '../result';
import type { PlanItem, SearchResult, StatusCategory } from '../../../shared/types';
import { getConfig } from '../../config';
import { findRefs } from '../../../shared/planRefs';

export interface SearchServiceDeps {
  getDatabase: () => Database;
}

interface RawSearchRow {
  id: string;
  entity_type: string;
  title: string;
  snippet: string | null;
  status_category: string | null;
  label: string | null;
  external_key: string | null;
  matched_field: string;
  updated_at: string | null;
}

interface IndexedDocument {
  entityId: string;
  absolutePath: string;
  title: string;
  updatedAt: string;
}

interface ExistingDocumentIndexRow {
  entity_id: string;
  title: string;
  updated_at: string | null;
}

interface DocumentSyncState {
  inFlight: Promise<void> | null;
  queued: boolean;
  debounceTimer: NodeJS.Timeout | null;
  subscription: AsyncSubscription | null;
  subscribeOperation: Promise<void> | null;
  watchedFolderPath: string | null;
  watchGeneration: number;
}

const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx']);
const MAX_DOCUMENT_BYTES_FOR_INDEX = 256 * 1024;
const DOCUMENT_TRUNCATION_SUFFIX = '\n\n[content truncated for search]';
const DOCUMENT_INDEX_READ_CONCURRENCY = 8;

const FTS_SEARCH_SQL = `
  WITH params AS (
    SELECT lower(?) AS normalized_query
  ),
  ranked AS (
    SELECT
      gsi.entity_id AS id,
      gsi.entity_type,
      gsi.title,
      gsi.body,
      gsi.status_category,
      gsi.label,
      gsi.external_key,
      gsi.updated_at,
      bm25(global_search_fts, 8.0, 1.5) AS score
    FROM global_search_fts
    JOIN global_search_index gsi ON gsi.id = global_search_fts.rowid
    WHERE gsi.project_id = ?
      AND gsi.entity_type IN ('plan_item', 'document')
      AND global_search_fts MATCH ?
  ),
  annotated AS (
    SELECT
      ranked.*,
      instr(lower(ranked.title), params.normalized_query) AS title_match_pos,
      instr(lower(COALESCE(ranked.body, '')), params.normalized_query) AS body_match_pos
    FROM ranked
    CROSS JOIN params
  )
  SELECT
    id,
    entity_type,
    title,
    CASE
      WHEN entity_type = 'plan_item' AND title_match_pos = 0 THEN
        CASE
          WHEN body_match_pos > 0
            THEN substr(body, max(1, body_match_pos - 40), 100)
          ELSE substr(COALESCE(body, ''), 1, 100)
        END
      WHEN entity_type = 'document' AND title_match_pos = 0 THEN
        CASE
          WHEN body_match_pos > 0
            THEN substr(body, max(1, body_match_pos - 40), 100)
          ELSE substr(COALESCE(body, ''), 1, 100)
        END
      ELSE NULL
    END AS snippet,
    status_category,
    label,
    external_key,
    CASE
      WHEN entity_type IN ('plan_item', 'document') AND title_match_pos > 0 THEN 'title'
      WHEN entity_type = 'plan_item' THEN 'description'
      WHEN entity_type = 'document' THEN 'content'
      ELSE 'content'
    END AS matched_field,
    updated_at
  FROM annotated
  ORDER BY
    CASE
      WHEN title_match_pos > 0 THEN 0
      ELSE 1
    END,
    score ASC,
    CASE entity_type
      WHEN 'document' THEN 1
      WHEN 'plan_item' THEN 2
      ELSE 3
    END,
    updated_at DESC
  LIMIT ?
`;

function buildFtsMatchQuery(rawQuery: string): string | null {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]+/gu, ''))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `${token}*`).join(' AND ');
}

function toEntityTitle(relativePath: string): string {
  const base = path.basename(relativePath, path.extname(relativePath));
  return base.replace(/[-_]+/g, ' ').trim() || relativePath;
}

function toIndexTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Build a hidden ref-titles block to append to an indexed doc body. For each
 * unique `@plan/<uuid>` in `content` whose UUID resolves, emit the item's
 * title (and external_key if present). FTS only sees text — there is no UI
 * surface for this string — so a flat newline list is enough to make a doc
 * matchable by the title of an item it references via the bare chip token.
 *
 * Returns null when no resolved refs are present.
 */
function collectRefTitlesForBody(
  content: string,
  itemsById: Map<string, Pick<PlanItem, 'title' | 'external_key'>>,
): string | null {
  if (!content || itemsById.size === 0) return null;
  const matches = findRefs(content);
  if (matches.length === 0) return null;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const match of matches) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    const item = itemsById.get(match.id);
    if (!item) continue;
    lines.push(item.external_key ? `${item.title} ${item.external_key}` : item.title);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

function loadPlanItemsById(
  db: Database,
  projectId: string,
): Map<string, Pick<PlanItem, 'title' | 'external_key'>> {
  const rows = db
    .prepare('SELECT id, title, external_key FROM plan_items WHERE project_id = ?')
    .all(projectId) as { id: string; title: string; external_key: string | null }[];
  const map = new Map<string, Pick<PlanItem, 'title' | 'external_key'>>();
  for (const row of rows) {
    map.set(row.id.toLowerCase(), { title: row.title, external_key: row.external_key });
  }
  return map;
}

function normalizeDocumentContent(content: string): string {
  // eslint-disable-next-line no-control-regex
  return content.replace(/\u0000/g, '').trim();
}

async function readDocumentContentForIndex(absolutePath: string): Promise<string> {
  const handle = await fs.open(absolutePath, 'r');
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, MAX_DOCUMENT_BYTES_FOR_INDEX);
    if (bytesToRead <= 0) return '';

    const buffer = Buffer.allocUnsafe(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    if (bytesRead <= 0) return '';

    let text = buffer.toString('utf8', 0, bytesRead);
    if (stat.size > MAX_DOCUMENT_BYTES_FOR_INDEX) {
      text += DOCUMENT_TRUNCATION_SUFFIX;
    }
    return normalizeDocumentContent(text);
  } finally {
    await handle.close();
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = new Array(safeConcurrency).fill(null).map(async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

async function listDocumentFiles(projectFolder: string): Promise<IndexedDocument[]> {
  let rootEntries: Dirent[];
  try {
    rootEntries = await fs.readdir(projectFolder, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const documents: IndexedDocument[] = [];
  const queue: { absoluteDir: string; entries: Dirent[] }[] = [{ absoluteDir: projectFolder, entries: rootEntries }];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) break;

    for (const entry of current.entries) {
      const absolutePath = path.join(current.absoluteDir, entry.name);

      if (entry.isDirectory()) {
        const childEntries = await fs.readdir(absolutePath, { withFileTypes: true });
        queue.push({ absoluteDir: absolutePath, entries: childEntries });
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!DOCUMENT_EXTENSIONS.has(extension)) continue;

      const stat = await fs.stat(absolutePath);
      const relativePath = path.relative(projectFolder, absolutePath).split(path.sep).join('/');
      documents.push({
        entityId: relativePath,
        absolutePath,
        title: toEntityTitle(relativePath),
        updatedAt: toIndexTimestamp(stat.mtime),
      });
    }
  }

  return documents;
}

export function createSearchService(deps: SearchServiceDeps) {
  let cachedDb: Database | null = null;
  let cachedFtsStatement: ReturnType<Database['prepare']> | null = null;
  let cachedHasFtsTables: boolean | null = null;
  const documentSyncState = new Map<string, DocumentSyncState>();
  const pendingWatcherOperations = new Set<Promise<void>>();
  let watcherReconcileInterval: NodeJS.Timeout | null = null;
  let backgroundIndexerStarted = false;

  function getFtsStatement() {
    const db = deps.getDatabase();
    if (cachedFtsStatement && cachedDb === db) {
      return cachedFtsStatement;
    }
    cachedDb = db;
    cachedFtsStatement = db.prepare(FTS_SEARCH_SQL);
    cachedHasFtsTables = null;
    return cachedFtsStatement;
  }

  function hasFtsTables() {
    const db = deps.getDatabase();
    if (cachedDb !== db) {
      cachedDb = db;
      cachedFtsStatement = null;
      cachedHasFtsTables = null;
    }
    if (cachedHasFtsTables !== null) {
      return cachedHasFtsTables;
    }
    const tableCheck = db.prepare(`
      SELECT
        EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'global_search_index') AS has_index,
        EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'global_search_fts') AS has_fts
    `).get() as { has_index: number; has_fts: number };
    cachedHasFtsTables = tableCheck.has_index === 1 && tableCheck.has_fts === 1;
    return cachedHasFtsTables;
  }

  function getProjectFolders(): { id: string; folder_path: string }[] {
    const db = deps.getDatabase();
    try {
      return db.prepare(`
        SELECT id, folder_path
        FROM projects
        WHERE folder_path IS NOT NULL AND length(trim(folder_path)) > 0
      `).all() as { id: string; folder_path: string }[];
    } catch {
      return [];
    }
  }

  function getOrCreateSyncState(projectId: string): DocumentSyncState {
    const existing = documentSyncState.get(projectId);
    if (existing) {
      return existing;
    }

    const initial: DocumentSyncState = {
      inFlight: null,
      queued: false,
      debounceTimer: null,
      subscription: null,
      subscribeOperation: null,
      watchedFolderPath: null,
      watchGeneration: 0,
    };
    documentSyncState.set(projectId, initial);
    return initial;
  }

  function trackWatcherOperation(operation: Promise<void>): Promise<void> {
    pendingWatcherOperations.add(operation);
    operation.then(
      () => pendingWatcherOperations.delete(operation),
      () => pendingWatcherOperations.delete(operation),
    );
    return operation;
  }

  function unsubscribeWatcher(sub: AsyncSubscription): Promise<void> {
    return trackWatcherOperation(
      sub.unsubscribe().catch((err) => {
        console.error('[SearchService] Failed to unsubscribe watcher:', err);
      }),
    );
  }

  async function waitForWatcherOperations(): Promise<void> {
    while (pendingWatcherOperations.size > 0) {
      await Promise.all(Array.from(pendingWatcherOperations));
    }
  }

  async function closeProjectWatcher(projectId: string): Promise<void> {
    const state = documentSyncState.get(projectId);
    if (!state) {
      return;
    }
    state.watchGeneration += 1;

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    const pending: Promise<void>[] = [];
    if (state.subscribeOperation) {
      pending.push(state.subscribeOperation);
    }
    if (state.subscription) {
      const sub = state.subscription;
      state.subscription = null;
      pending.push(unsubscribeWatcher(sub));
    }
    state.watchedFolderPath = null;

    await Promise.all(pending);
  }

    return DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  async function syncProjectDocuments(projectId: string): Promise<void> {
    const db = deps.getDatabase();
    let project: { folder_path: string } | undefined;
    try {
      project = db.prepare('SELECT folder_path FROM projects WHERE id = ?').get(projectId) as
        | { folder_path: string }
        | undefined;
    } catch {
      return;
    }

    if (!project?.folder_path) {
      return;
    }

    const discovered = await listDocumentFiles(project.folder_path);
    const discoveredById = new Map(discovered.map((doc) => [doc.entityId, doc]));

    const existing = db.prepare(`
      SELECT entity_id, title, updated_at
      FROM global_search_index
      WHERE project_id = ? AND entity_type = 'document'
    `).all(projectId) as ExistingDocumentIndexRow[];

    const existingById = new Map(existing.map((row) => [row.entity_id, row]));
    const docsNeedingUpdate = discovered.filter((doc) => {
      const current = existingById.get(doc.entityId);
      return current?.title !== doc.title || current?.updated_at !== doc.updatedAt;
    });

    // Resolve @plan/<uuid> tokens to their item titles when building the
    // FTS body so a search for "export pipeline" finds docs that reference
    // @plan/<uuid-of-export-pipeline-item> via the chip token alone — not
    // just docs that mention the title in prose.
    const planItemsById = loadPlanItemsById(db, projectId);

    const indexedBodies = await mapWithConcurrency(
      docsNeedingUpdate,
      DOCUMENT_INDEX_READ_CONCURRENCY,
      async (doc) => {
        const content = await readDocumentContentForIndex(doc.absolutePath);
        const refTitles = collectRefTitlesForBody(content, planItemsById);
        const augmented = refTitles ? `${content}\n\n${refTitles}` : content;
        return {
          entityId: doc.entityId,
          body: normalizeDocumentContent(`${doc.entityId}\n${augmented}`),
        };
      },
    );
    const indexedBodyByEntityId = new Map(indexedBodies.map((entry) => [entry.entityId, entry.body]));

    const tx = db.transaction(() => {
      const deleteByEntity = db.prepare(`
        DELETE FROM global_search_index
        WHERE project_id = ? AND entity_type = 'document' AND entity_id = ?
      `);
      const insertDoc = db.prepare(`
        INSERT INTO global_search_index (
          entity_type, entity_id, project_id, title, body, updated_at
        ) VALUES ('document', ?, ?, ?, ?, ?)
      `);

      for (const row of existing) {
        if (!discoveredById.has(row.entity_id)) {
          deleteByEntity.run(projectId, row.entity_id);
        }
      }

      for (const doc of docsNeedingUpdate) {
        deleteByEntity.run(projectId, doc.entityId);
        insertDoc.run(
          doc.entityId,
          projectId,
          doc.title,
          indexedBodyByEntityId.get(doc.entityId) ?? doc.entityId,
          doc.updatedAt,
        );
      }
    });

    tx();
  }

  function flushDocumentSync(projectId: string): void {
    const state = getOrCreateSyncState(projectId);
    if (state.inFlight) {
      state.queued = true;
      return;
    }

    state.inFlight = syncProjectDocuments(projectId)
      .catch((error) => {
        console.error('[SearchService] Document sync error:', error);
      })
      .finally(() => {
        state.inFlight = null;
        if (state.queued) {
          state.queued = false;
          flushDocumentSync(projectId);
        }
      });
  }

  function scheduleFilesystemDocumentIndexSync(projectId: string, immediate = false): void {
    const state = getOrCreateSyncState(projectId);

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    if (immediate) {
      flushDocumentSync(projectId);
      return;
    }

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      flushDocumentSync(projectId);
    }, getConfig().watcher.searchDocSyncDebounceMs);
  }

  function watchProjectFolderForDocs(projectId: string, projectFolderPath: string): void {
    const state = getOrCreateSyncState(projectId);
    if (state.watchedFolderPath === projectFolderPath && (state.subscription || state.subscribeOperation)) {
      return;
    }

    void closeProjectWatcher(projectId);
    const generation = state.watchGeneration + 1;
    state.watchGeneration = generation;
    state.watchedFolderPath = projectFolderPath;

    const subscribePromise = subscribe(
      projectFolderPath,
      (err, events) => {
        if (!backgroundIndexerStarted) {
          return;
        }
        if (err) {
          console.error('[SearchService] Project watcher error:', err);
          void closeProjectWatcher(projectId);
          return;
        }
          scheduleFilesystemDocumentIndexSync(projectId, false);
        }
      },
    );

    const subscribeOperation = trackWatcherOperation(subscribePromise.then(async (sub) => {
      // If the watcher was closed (or replaced) between subscribe() and
      // resolution, dispose of the stale subscription.
      const current = documentSyncState.get(projectId);
      if (
        current?.watchGeneration !== generation ||
        current?.watchedFolderPath !== projectFolderPath ||
        !backgroundIndexerStarted
      ) {
        await unsubscribeWatcher(sub);
        return;
      }
      current.subscription = sub;
    }).catch((subscribeError) => {
      console.error('[SearchService] Failed to start project watcher for indexing:', subscribeError);
      const current = documentSyncState.get(projectId);
      if (current?.watchedFolderPath === projectFolderPath) {
        current.watchedFolderPath = null;
      }
    }));
    state.subscribeOperation = subscribeOperation;
    void subscribeOperation.then(() => {
      const current = documentSyncState.get(projectId);
      if (current?.subscribeOperation === subscribeOperation) {
        current.subscribeOperation = null;
      }
    });
  }

  function reconcileProjectWatchers(): void {
    const projects = getProjectFolders();
    const activeProjectIds = new Set(projects.map((project) => project.id));

    for (const existingProjectId of documentSyncState.keys()) {
      if (!activeProjectIds.has(existingProjectId)) {
        void closeProjectWatcher(existingProjectId);
        documentSyncState.delete(existingProjectId);
      }
    }

    for (const project of projects) {
      const state = getOrCreateSyncState(project.id);
      if (state.watchedFolderPath !== project.folder_path) {
        watchProjectFolderForDocs(project.id, project.folder_path);
        scheduleFilesystemDocumentIndexSync(project.id, false);
      }
    }
  }

  function startBackgroundIndexing(): void {
    if (backgroundIndexerStarted) {
      return;
    }

    if (!hasFtsTables()) {
      return;
    }
    backgroundIndexerStarted = true;

    reconcileProjectWatchers();
    watcherReconcileInterval = setInterval(() => {
      reconcileProjectWatchers();
    }, getConfig().watcher.searchReconcileIntervalMs);
  }

  async function disposeBackgroundIndexing(): Promise<void> {
    if (watcherReconcileInterval) {
      clearInterval(watcherReconcileInterval);
      watcherReconcileInterval = null;
    }

    backgroundIndexerStarted = false;

    const pending = Array.from(documentSyncState.keys()).map((projectId) => closeProjectWatcher(projectId));
    documentSyncState.clear();

    await Promise.all(pending);
    await waitForWatcherOperations();
  }

  return {
    startBackgroundIndexing,
    disposeBackgroundIndexing,
    async search(projectId: string, query: string, limit = 50): AsyncResult<SearchResult[]> {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        return failure('Search query cannot be empty');
      }

      const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
      if (!hasFtsTables()) {
        return failure('Global search index is not ready');
      }

      try {
        const ftsMatchQuery = buildFtsMatchQuery(normalizedQuery);
        if (!ftsMatchQuery) {
          return success([]);
        }

        const rows = await Promise.resolve(getFtsStatement().all([
          normalizedQuery,
          projectId,
          ftsMatchQuery,
          safeLimit,
        ]) as RawSearchRow[]);

        const results: SearchResult[] = rows.map((row) => ({
          id: row.id,
          entityType: row.entity_type as SearchResult['entityType'],
          title: row.title,
          snippet: row.snippet,
          metadata: {
            statusCategory: row.status_category as StatusCategory | null,
            label: row.label,
            externalKey: row.external_key,
          },
          matchedField: row.matched_field,
          updatedAt: row.updated_at,
        }));

        return success(results);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        console.error('[SearchService] Search error:', error);
        return failure(message);
      }
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
