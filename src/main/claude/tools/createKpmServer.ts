/**
 *
 * The server is created once at app startup and reused across all messages.
 * Plan action callbacks are handled via an event emitter pattern.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';
import { AsyncLocalStorage } from 'async_hooks';
import { CONTEXT_FILE_NAMES } from '../../../shared/contextFile';

import { createPlanItemTools } from './plan-items';
import { createRelationTools } from './relations';
import { createGroupTools } from './groups';
import { createJiraTools } from './jira';
import { createStorybookTools } from './storybook';
import { createPlanChangeTools } from './plan-changes';
import { createClaudeMdEditTools, type ClaudeMdUpdateCallback, type ClaudeMdUpdatePayload } from './claudemd-update';
import { createDocumentCreateTools, type DocumentUpdateCallback, type DocumentUpdatePayload } from './document-update';
import { createDocumentEditTools } from './document-edit';
import { resolveScopedPath } from '../../services/files/scopedFs';
import fs from 'fs';
import { createGitHubTools } from './github';
import { createConfluenceTools } from './confluence';
import { createBriefingTools } from './briefing';
import { createFileMoveTools } from './file-move';

// Cached tools array - collected once at warmup, reused per session
let cachedTools: Parameters<typeof createSdkMcpServer>[0]['tools'] | null = null;

// Cache for pending document content (proposed but not yet accepted).
const pendingDocumentContent = new Map<string, string>();

/**
 */
  for (const key of pendingDocumentContent.keys()) {
    if (key.startsWith(prefix)) {
      pendingDocumentContent.delete(key);
    }
  }
}

// Event emitter for plan actions - allows per-message callbacks with singleton server
const planActionsEmitter = new EventEmitter();

// Event emitter for project context file updates
const claudeMdUpdateEmitter = new EventEmitter();

// Event emitter for document updates
const documentUpdateEmitter = new EventEmitter();

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
 */
  for (const filename of CONTEXT_FILE_NAMES) {
    const content = await readProjectFile(projectId, filename);
  }
  return null;
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
 * Internal callback that emits to all subscribers
 */
function emitPlanActions(actions: PlanAction[]): void {
  const context = toolExecutionContext.getStore();
  if (!context?.projectId || !context?.chatSessionId) {
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
 */
function emitClaudeMdUpdate(update: ClaudeMdUpdatePayload): void {
  const context = toolExecutionContext.getStore();
  claudeMdUpdateEmitter.emit('claudeMdUpdate', {
    ...update,
  });
}

/**
 * Internal callback that emits document update to all subscribers.
 * Also caches the proposed content so subsequent edits to the same file
 * accumulate correctly.
 */
function emitDocumentUpdate(update: DocumentUpdatePayload): void {
  const context = toolExecutionContext.getStore();

  documentUpdateEmitter.emit('documentUpdate', {
    ...update,
  });
}

/**
 * Read a project file, checking the pending content cache first.
 * Falls back to disk if no pending content exists for this file.
 */
async function readProjectFileWithPending(projectId: string, filePath: string): Promise<string | null> {
  }
  return readProjectFile(projectId, filePath);
}

/**
 */
function collectTools() {
  if (cachedTools) return cachedTools;


  const planItemTools = createPlanItemTools(planItemRepo, planRelationRepo, emitPlanActions);
  const relationTools = createRelationTools(planItemRepo);
  const groupTools = createGroupTools(groupRepo, planItemRepo, emitPlanActions);
  const planChangeTools = createPlanChangeTools(emitPlanActions);
  const storybookTools = createStorybookTools(projectRepo);
  const documentCreateTools = createDocumentCreateTools(emitDocumentUpdate);
  const documentEditTools = createDocumentEditTools(readProjectFileWithPending, emitDocumentUpdate);

    ...planItemTools,
    ...relationTools,
    ...groupTools,
    ...planChangeTools,
    ...jiraTools,
    ...storybookTools,
    ...claudeMdEditTools,
    ...documentCreateTools,
    ...documentEditTools,
    ...githubTools,
    ...confluenceTools,
    ...briefingTools,
    ...fileMoveTools,
  ];

}

/**
 */
  if (cachedTools) {
    return;
  }

  const startTime = Date.now();
  collectTools();
  const elapsed = Date.now() - startTime;
}

/**
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
  });
}
