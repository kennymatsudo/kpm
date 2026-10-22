/**
 * The live model list for Claude and Codex, shared by chat, the board, and the
 * renderer.
 *
 * Reads are synchronous and never wait on a provider: they return the last
 * list KPM fetched (saved under userData), or the built-in fallback before
 * the first fetch. `refreshModelCatalog` runs at launch in the background.
 * Each provider refreshes on its own, so a signed-out Codex keeps its
 * previous list without holding back Claude's. The fetchers own their
 * timeouts because hitting one has to kill the provider process too.
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config';
import {
  FALLBACK_MODEL_CATALOG,
  parseClaudeModels,
  parseCodexModelList,
  type CatalogModel,
  type ClaudeSupportedModel,
  type ModelCatalog,
} from '../../shared/modelCatalog';

export interface ModelCatalogFetchers {
  claude: () => Promise<ClaudeSupportedModel[]>;
  codex: () => Promise<unknown>;
}

let current: ModelCatalog | null = null;

function catalogFilePath(): string {
  return path.join(app.getPath('userData'), getConfig().session.modelCatalogFilename);
}

function isCatalogModelList(value: unknown): value is CatalogModel[] {
  return Array.isArray(value) && value.length > 0 && value.every((model) => (
    typeof model === 'object' && model !== null
    && typeof (model as CatalogModel).id === 'string'
    && typeof (model as CatalogModel).label === 'string'
    && Array.isArray((model as CatalogModel).effortLevels)
  ));
}

function readSavedCatalog(): ModelCatalog | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogFilePath(), 'utf8')) as Partial<ModelCatalog>;
    return {
      claude: isCatalogModelList(parsed.claude) ? parsed.claude : FALLBACK_MODEL_CATALOG.claude,
      codex: isCatalogModelList(parsed.codex) ? parsed.codex : FALLBACK_MODEL_CATALOG.codex,
    };
  } catch {
    return null;
  }
}

function saveCatalog(catalog: ModelCatalog): void {
  try {
    fs.writeFileSync(catalogFilePath(), JSON.stringify(catalog), 'utf8');
  } catch (error) {
    console.warn('[modelCatalog] Failed to save the model list:', error);
  }
}

export function getModelCatalog(): ModelCatalog {
  current ??= readSavedCatalog() ?? FALLBACK_MODEL_CATALOG;
  return current;
}

async function fetchProvider<T>(
  label: string,
  fetch: () => Promise<T>,
  parse: (raw: T) => CatalogModel[] | null,
): Promise<CatalogModel[] | null> {
  try {
    return parse(await fetch());
  } catch (error) {
    console.warn(`[modelCatalog] ${label} model list unavailable; keeping the previous list:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch both providers' lists and adopt whatever came back. Calls `onChange`
 * only when the list actually differs, so an unchanged launch sends nothing
 * to the renderer.
 */
export async function refreshModelCatalog(
  fetchers: ModelCatalogFetchers,
  onChange: (catalog: ModelCatalog) => void,
): Promise<ModelCatalog> {
  const [claude, codex] = await Promise.all([
    fetchProvider('Claude', fetchers.claude, parseClaudeModels),
    fetchProvider('Codex', fetchers.codex, parseCodexModelList),
  ]);
  const previous = getModelCatalog();
  const next: ModelCatalog = {
    claude: claude ?? previous.claude,
    codex: codex ?? previous.codex,
  };
  if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
  current = next;
  saveCatalog(next);
  onChange(next);
  return next;
}

/** Test-only: forget the in-memory list so the next read reloads it. */
export function resetModelCatalogForTests(): void {
  current = null;
}
