/**
 * KPM Server Factory
 *
 * Creates a singleton in-process SDK MCP server with all KPM tools.
 * The server is created once at app startup and reused across all messages.
 * Plan action callbacks are handled via an event emitter pattern.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { AsyncLocalStorage } from 'async_hooks';
import type { BrowserWindow } from 'electron';
import { CONTEXT_FILE_NAMES, CONTEXT_FILE_PENDING_CACHE_KEY } from '../../../shared/contextFile';
import type { IRepositoryContainer } from '../../db/interfaces';
import type { AppServices } from '../../services/appServices';

import { createPlanItemTools } from './plan-items';
import { createRelationTools } from './relations';
import { createGroupTools } from './groups';
import { createJiraTools } from './jira';
import { createStorybookTools } from './storybook';
import { createPlanChangeTools } from './plan-changes';
import { createClaudeMdEditTools, type ClaudeMdUpdateCallback, type ClaudeMdUpdatePayload } from './claudemd-update';
import { createDocumentCreateTools, type DocumentUpdateCallback, type DocumentUpdatePayload } from './document-update';
import { createDocumentEditTools } from './document-edit';
import { createDocumentReadTools } from './document-read';
import { resolveScopedPath } from '../../services/files/scopedFs';
import fs from 'fs';
import { createGitHubTools } from './github';
import { createConfluenceTools } from './confluence';
import { createBriefingTools } from './briefing';
import { createFileMoveTools } from './file-move';
import { createFileDeleteTools, type FileDeleteCallback, type FileDeletePayload } from './file-delete';
import { createListProjectFilesTools } from './list-project-files';
import { createPlanRefTools } from './plan-refs';
import { createSpillReadTools } from './spill-read';
import { createGitReadTools } from './git-read';
import type { PlanAction } from '../../../shared/types';

export interface KpmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: unknown;
  _meta?: Record<string, unknown>;
  handler: (args: unknown, extra: unknown) => Promise<unknown>;
}

export const KPM_MCP_INSTRUCTIONS = `KPM tools are local project-planning tools. Chat is read-only against repos: do not write repo files from chat. Plan-mutating tools propose PlanAction[] for KPM review or auto-apply; they must not bypass KPM's approval flow or write plan rows directly. Document, context-file, move, and delete tools emit proposals for KPM to surface to the user. Use @plan/<uuid> only for plan item UUIDs returned by KPM tools. Keep responses concise and utilitarian.`;

// Cached tools array - collected once at warmup, reused per session
let cachedTools: Parameters<typeof createSdkMcpServer>[0]['tools'] | null = null;
let cachedFocusTools: Parameters<typeof createSdkMcpServer>[0]['tools'] | null = null;

interface KpmToolRuntimeDeps {
  container: Pick<
    IRepositoryContainer,
    | 'projects'
    | 'planItems'
    | 'planRelations'
    | 'groups'
    | 'repos'
    | 'devSessions'
    | 'confluenceLinks'
  >;
  services: Pick<AppServices, 'briefingService' | 'fileExplorerService'>;
  getMainWindow: () => BrowserWindow | null;
}

let kpmToolRuntimeDeps: KpmToolRuntimeDeps | null = null;

function initializeKpmToolRuntime(deps: KpmToolRuntimeDeps): void {
  kpmToolRuntimeDeps = deps;
  cachedTools = null;
  cachedFocusTools = null;
}

function getKpmToolRuntime(): KpmToolRuntimeDeps {
  if (!kpmToolRuntimeDeps) {
    throw new Error('KPM tool runtime not initialized. Call warmupMcpSdk() during app startup.');
  }
  return kpmToolRuntimeDeps;
}

// Cache for pending document content (proposed but not yet accepted).
// Keyed by `${chatSessionId}:${filePath}` for documents and
// `${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}` for the project
// context file. Scoping by session prevents two concurrent sessions on the
// same project from polluting each other's pending state. Cleared at the
// start of every new turn so prior turns don't bleed in.
const pendingDocumentContent = new Map<string, string>();

/**
 * Clear all pending document content entries for a chat session (documents +
 * context file). Called at the start of a new message to avoid stale cache
 * from prior turns.
 */
export function clearPendingDocumentContent(chatSessionId: string): void {
  const prefix = `${chatSessionId}:`;
  for (const key of pendingDocumentContent.keys()) {
    if (key.startsWith(prefix)) {
      pendingDocumentContent.delete(key);
    }
  }
  // Also forget the resolved context filename — the user may have switched
  // projects or renamed the file between turns.
  resolvedContextFilename.delete(chatSessionId);
}

// Per-session memo of which context file (AGENTS.md vs CLAUDE.md) actually
// exists on disk. Avoids stat'ing both candidates on every read. Cleared
// alongside the pending cache.
const resolvedContextFilename = new Map<string, string>();

// Event emitter for plan actions - allows per-message callbacks with singleton server
const planActionsEmitter = new EventEmitter();

// Event emitter for project context file updates
const claudeMdUpdateEmitter = new EventEmitter();

// Event emitter for document updates
const documentUpdateEmitter = new EventEmitter();

// Event emitter for file deletion proposals
const fileDeleteEmitter = new EventEmitter();

interface ToolExecutionContext {
  projectId: string;
  chatSessionId?: string;
}

export interface PlanActionsEvent {
  projectId: string;
  chatSessionId: string;
  actions: PlanAction[];
}

export type PlanActionsCallback = (event: PlanActionsEvent) => void;

const toolExecutionContext = new AsyncLocalStorage<ToolExecutionContext>();

/**
 * Read a project file by projectId and relative path.
 * Returns file content or null if not found.
 */
async function readProjectFile(projectId: string, filePath: string): Promise<string | null> {
  const { container } = getKpmToolRuntime();
  const project = container.projects.get(projectId);
  if (!project) return null;

  const scoped = resolveScopedPath(project.folder_path, filePath);
  if (!scoped.valid) return null;

  try {
    return await fs.promises.readFile(scoped.fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read the project context file (AGENTS.md or CLAUDE.md).
 * Checks the memoized filename first; otherwise probes AGENTS.md then CLAUDE.md.
 * Returns content + the resolved filename, or null if neither exists.
 */
async function readProjectContextFile(
  projectId: string
): Promise<{ content: string; filename: string } | null> {
  const chatSessionId = toolExecutionContext.getStore()?.chatSessionId;
  const memoized = chatSessionId ? resolvedContextFilename.get(chatSessionId) : undefined;
  if (memoized) {
    const content = await readProjectFile(projectId, memoized);
    if (content !== null) return { content, filename: memoized };
    // File was deleted/renamed since memoization — fall through to re-probe.
    resolvedContextFilename.delete(chatSessionId!);
  }

  for (const filename of CONTEXT_FILE_NAMES) {
    const content = await readProjectFile(projectId, filename);
    if (content !== null) {
      if (chatSessionId) resolvedContextFilename.set(chatSessionId, filename);
      return { content, filename };
    }
  }
  return null;
}

/**
 * Read the project context file, checking the pending cache first so
 * sequential edits within the same turn accumulate correctly.
 */
async function readProjectContextFileWithPending(
  projectId: string
): Promise<{ content: string; filename: string } | null> {
  const chatSessionId = toolExecutionContext.getStore()?.chatSessionId;
  if (chatSessionId) {
    const cached = pendingDocumentContent.get(`${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}`);
    if (cached !== undefined) {
      const filename = resolvedContextFilename.get(chatSessionId);
      if (filename) return { content: cached, filename };
      // Filename wasn't memoized yet — fall through to disk to learn it;
      // cheap because it only happens once.
    }
  }
  return readProjectContextFile(projectId);
}

/**
 * Run code with a tool execution context so singleton tool callbacks can route
 * updates to the originating chat session.
 */
export function runWithToolExecutionContext<T>(
  context: ToolExecutionContext,
  fn: () => T
): T {
  return toolExecutionContext.run(context, fn);
}

/**
 * Subscribe to plan actions for the current message context.
 * Returns an unsubscribe function.
 */
export function subscribeToPlanActions(callback: PlanActionsCallback): () => void {
  planActionsEmitter.on('planActions', callback);
  return () => planActionsEmitter.off('planActions', callback);
}

/**
 * Subscribe to project context file update proposals.
 * Returns an unsubscribe function.
 */
export function subscribeToClaudeMdUpdate(callback: ClaudeMdUpdateCallback): () => void {
  claudeMdUpdateEmitter.on('claudeMdUpdate', callback);
  return () => claudeMdUpdateEmitter.off('claudeMdUpdate', callback);
}

/**
 * Subscribe to document update proposals.
 * Returns an unsubscribe function.
 */
export function subscribeToDocumentUpdate(callback: DocumentUpdateCallback): () => void {
  documentUpdateEmitter.on('documentUpdate', callback);
  return () => documentUpdateEmitter.off('documentUpdate', callback);
}

/**
 * Subscribe to file deletion proposals.
 * Returns an unsubscribe function.
 */
export function subscribeToFileDelete(callback: (payload: FileDeletePayload) => void): () => void {
  fileDeleteEmitter.on('fileDelete', callback);
  return () => fileDeleteEmitter.off('fileDelete', callback);
}

/**
 * Internal callback that emits to all subscribers
 */
function emitPlanActions(actions: PlanAction[]): void {
  const context = toolExecutionContext.getStore();
  if (!context?.projectId || !context?.chatSessionId) {
    console.warn('[KPM Tools] Skipping unscoped plan actions event');
    return;
  }

  const payload: PlanActionsEvent = {
    projectId: context.projectId,
    chatSessionId: context.chatSessionId,
    actions,
  };
  planActionsEmitter.emit('planActions', payload);
}

/**
 * Internal callback that emits project context file update to all subscribers.
 * Also caches the proposed content so subsequent edits to the context file
 * within the same turn accumulate correctly.
 */
function emitClaudeMdUpdate(update: ClaudeMdUpdatePayload): void {
  const context = toolExecutionContext.getStore();
  const chatSessionId = update.chatSessionId ?? context?.chatSessionId;
  if (chatSessionId) {
    pendingDocumentContent.set(`${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}`, update.newContent);
    // Memoize filename so subsequent reads can short-circuit the probe.
    resolvedContextFilename.set(chatSessionId, update.filename);
  }

  claudeMdUpdateEmitter.emit('claudeMdUpdate', {
    ...update,
    chatSessionId,
  });
}

/**
 * Internal callback that emits document update to all subscribers.
 * Also caches the proposed content so subsequent edits to the same file
 * accumulate correctly.
 */
function emitDocumentUpdate(update: DocumentUpdatePayload): void {
  const context = toolExecutionContext.getStore();
  const chatSessionId = update.chatSessionId ?? context?.chatSessionId;
  if (chatSessionId) {
    // Cache proposed content for subsequent edits within the same turn
    pendingDocumentContent.set(`${chatSessionId}:${update.filePath}`, update.content);
  }

  documentUpdateEmitter.emit('documentUpdate', {
    ...update,
    chatSessionId,
  });
}

/**
 * Internal callback that emits a file deletion proposal to all subscribers,
 * scoped to the originating chat session. Unlike document updates there is no
 * pending-content cache — the proposal carries only the target path.
 */
const emitFileDelete: FileDeleteCallback = (payload) => {
  const context = toolExecutionContext.getStore();
  const chatSessionId = payload.chatSessionId ?? context?.chatSessionId;
  fileDeleteEmitter.emit('fileDelete', {
    ...payload,
    chatSessionId,
  });
};

/**
 * Read a project file, checking the pending content cache first.
 * Falls back to disk if no pending content exists for this file.
 */
async function readProjectFileWithPending(projectId: string, filePath: string): Promise<string | null> {
  const chatSessionId = toolExecutionContext.getStore()?.chatSessionId;
  if (chatSessionId) {
    const cached = pendingDocumentContent.get(`${chatSessionId}:${filePath}`);
    if (cached !== undefined) {
      return cached;
    }
  }
  return readProjectFile(projectId, filePath);
}

/**
 * Read pending (proposed-but-unapproved) content for a project-relative file
 * path under an explicit chat session, or undefined if nothing is pending.
 *
 * Used by the built-in Edit/Write interception (permissions.ts), which runs in
 * the SDK's `canUseTool` callback where the AsyncLocalStorage context is not
 * relied upon. Keyed identically to `readProjectFileWithPending` /
 * `emitDocumentUpdate` so the interception and the `propose_document_edit` tool
 * share one accumulation cache.
 */
export function peekPendingDocumentContent(
  chatSessionId: string | undefined,
  filePath: string
): string | undefined {
  if (!chatSessionId) return undefined;
  return pendingDocumentContent.get(`${chatSessionId}:${filePath}`);
}

/**
 * Record proposed content for a project-relative file path so subsequent edits
 * to the same file within the turn build on it instead of re-reading stale disk.
 * Mirrors the cache write that `emitDocumentUpdate` performs for the tool path.
 * Cleared per turn via `clearPendingDocumentContent`.
 */
export function recordPendingDocumentContent(
  chatSessionId: string | undefined,
  filePath: string,
  content: string
): void {
  if (!chatSessionId) return;
  pendingDocumentContent.set(`${chatSessionId}:${filePath}`, content);
}

/**
 * Logs the context-window footprint of the tool definitions sent to the model.
 *
 * Tool definitions (name + description + JSON Schema) are injected into context
 * before the conversation starts, so this answers "are the first-party tools
 * actually a context problem for KPM?" with a real number rather than a guess.
 * Runs once at warmup (tools are cached), so it is not a hot path. Token figures
 * are a rough estimate (chars / 4) and exclude the `mcp__kpm__` name prefix the
 * SDK prepends and any per-server framing — so treat them as a lower bound.
 */
function logToolDefinitionFootprint(tools: NonNullable<typeof cachedTools>): void {
  const CHARS_PER_TOKEN = 4;
  const estTok = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

  const rows = tools.map((t) => {
    let schemaChars = -1; // -1 = schema could not be serialized to JSON Schema
    try {
      const jsonSchema = z.toJSONSchema(z.object(t.inputSchema), { unrepresentable: 'any' });
      schemaChars = JSON.stringify(jsonSchema).length;
    } catch {
      // Leave at -1; the name + description still count toward the footprint.
    }
    const descChars = t.description.length;
    const totalChars = t.name.length + descChars + Math.max(0, schemaChars);
    return { name: t.name, descChars, schemaChars, totalChars };
  });

  rows.sort((a, b) => b.totalChars - a.totalChars);
  const totalChars = rows.reduce((sum, r) => sum + r.totalChars, 0);

  console.log(
    `[KPM Server] Tool-definition footprint: ${rows.length} tools, ~${totalChars.toLocaleString()} chars ` +
    `(~${estTok(totalChars).toLocaleString()} est. tokens). Largest first:`
  );
  for (const r of rows) {
    const schemaNote = r.schemaChars < 0 ? 'schema n/a' : `schema ${r.schemaChars}c`;
    console.log(`  ${r.name}: ~${estTok(r.totalChars)} tok (desc ${r.descChars}c, ${schemaNote})`);
  }
}

/**
 * Collect all KPM tools. Cached after first call.
 */
function collectTools() {
  if (cachedTools) return cachedTools;

  const { container, services, getMainWindow } = getKpmToolRuntime();
  const projectRepo = container.projects;
  const planItemRepo = container.planItems;
  const planRelationRepo = container.planRelations;
  const groupRepo = container.groups;
  const repoRepo = container.repos;

  const planItemTools = createPlanItemTools(planItemRepo, planRelationRepo, emitPlanActions);
  const relationTools = createRelationTools(planItemRepo);
  const groupTools = createGroupTools(groupRepo);
  const planChangeTools = createPlanChangeTools(emitPlanActions);
  const jiraTools = createJiraTools();
  const storybookTools = createStorybookTools(projectRepo);
  const claudeMdEditTools = createClaudeMdEditTools(readProjectContextFileWithPending, emitClaudeMdUpdate);
  const documentReadTools = createDocumentReadTools(readProjectFileWithPending);
  const documentCreateTools = createDocumentCreateTools(emitDocumentUpdate);
  const documentEditTools = createDocumentEditTools(readProjectFileWithPending, emitDocumentUpdate);
  const githubTools = createGitHubTools(planItemRepo, repoRepo, container.devSessions);
  const confluenceTools = createConfluenceTools(container.confluenceLinks);
  const briefingTools = createBriefingTools(services.briefingService);
  const fileMoveTools = createFileMoveTools({
    fileExplorerService: services.fileExplorerService,
    getMainWindow,
  });
  const fileDeleteTools = createFileDeleteTools({
    fileExplorerService: services.fileExplorerService,
    onFileDelete: emitFileDelete,
  });
  const listProjectFilesTools = createListProjectFilesTools({
    fileExplorerService: services.fileExplorerService,
  });
  const planRefTools = createPlanRefTools({
    planItems: planItemRepo,
    projects: projectRepo,
  });
  const spillReadTools = createSpillReadTools();
  const gitReadTools = createGitReadTools({ repos: repoRepo });

  const tools = [
    ...planItemTools,
    ...relationTools,
    ...groupTools,
    ...planChangeTools,
    ...jiraTools,
    ...storybookTools,
    ...claudeMdEditTools,
    ...documentReadTools,
    ...documentCreateTools,
    ...documentEditTools,
    ...githubTools,
    ...confluenceTools,
    ...briefingTools,
    ...fileMoveTools,
    ...fileDeleteTools,
    ...listProjectFilesTools,
    ...planRefTools,
    ...spillReadTools,
    ...gitReadTools,
  ];
  cachedTools = tools;

  console.log('[KPM Server] Registered tools:', tools.map(t => t.name).join(', '));
  logToolDefinitionFootprint(tools);
  return tools;
}

/**
 * Collect the reduced KPM tool set used by focus-reader chat sessions.
 */
function collectFocusTools() {
  if (cachedFocusTools) return cachedFocusTools;

  const { container, services } = getKpmToolRuntime();
  const projectRepo = container.projects;
  const planItemRepo = container.planItems;

  const claudeMdEditTools = createClaudeMdEditTools(readProjectContextFileWithPending, emitClaudeMdUpdate);
  const documentReadTools = createDocumentReadTools(readProjectFileWithPending);
  const documentCreateTools = createDocumentCreateTools(emitDocumentUpdate);
  const documentEditTools = createDocumentEditTools(readProjectFileWithPending, emitDocumentUpdate);
  const listProjectFilesTools = createListProjectFilesTools({
    fileExplorerService: services.fileExplorerService,
  });
  const planRefTools = createPlanRefTools({
    planItems: planItemRepo,
    projects: projectRepo,
  });

  const tools = [
    ...claudeMdEditTools,
    ...documentReadTools,
    ...documentCreateTools,
    ...documentEditTools,
    ...listProjectFilesTools,
    ...planRefTools,
  ];
  cachedFocusTools = tools;

  console.log('[KPM Server] Registered focus tools:', tools.map(t => t.name).join(', '));
  logToolDefinitionFootprint(tools);
  return tools;
}

export function getKpmToolDefinitions(): KpmToolDefinition[] {
  return collectTools() as unknown as KpmToolDefinition[];
}

export function getFocusKpmToolDefinitions(): KpmToolDefinition[] {
  return collectFocusTools() as unknown as KpmToolDefinition[];
}

/**
 * Initialize KPM tools at app startup to avoid lazy initialization delays.
 */
export function warmupMcpSdk(deps: KpmToolRuntimeDeps): void {
  initializeKpmToolRuntime(deps);
  if (cachedTools) {
    console.log('[KPM Server] Already initialized');
    return;
  }

  console.log('[KPM Server] Initializing tools...');
  const startTime = Date.now();
  collectTools();
  collectFocusTools();
  const elapsed = Date.now() - startTime;
  console.log(`[KPM Server] Tools initialized in ${elapsed}ms`);
}

/**
 * Create a fresh KPM MCP server instance.
 *
 * Each session needs its own server instance because the SDK binds an
 * internal Protocol transport to the server on connect. Reusing a server
 * across sessions causes "Already connected to a transport" errors.
 */
export function getKpmServer() {
  const tools = collectTools();
  return createSdkMcpServer({
    name: 'kpm',
    version: '1.0.0',
    tools,
    // Ensures KPM tools are always present in Claude's context (not deferred
    // behind tool search) and that the server is connected before the first
    // turn — required since the init message would otherwise report kpm as
    // 'pending' under the SDK's background-connection default.
    alwaysLoad: true,
  });
}

export function getFocusKpmServer() {
  const tools = collectFocusTools();
  return createSdkMcpServer({
    name: 'kpm',
    version: '1.0.0',
    tools,
    alwaysLoad: true,
  });
}
