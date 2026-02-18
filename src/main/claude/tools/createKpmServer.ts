/**
 *
 * The server is created once at app startup and reused across all messages.
 * Plan action callbacks are handled via an event emitter pattern.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';
import { AsyncLocalStorage } from 'async_hooks';

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


// Event emitter for plan actions - allows per-message callbacks with singleton server
const planActionsEmitter = new EventEmitter();

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
 */
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
 */
function emitDocumentUpdate(update: DocumentUpdatePayload): void {
  const context = toolExecutionContext.getStore();
  documentUpdateEmitter.emit('documentUpdate', {
    ...update,
  });
}

/**
 */


  const planItemTools = createPlanItemTools(planItemRepo, planRelationRepo, emitPlanActions);
  const relationTools = createRelationTools(planItemRepo);
  const groupTools = createGroupTools(groupRepo, planItemRepo, emitPlanActions);
  const planChangeTools = createPlanChangeTools(emitPlanActions);
  const storybookTools = createStorybookTools(projectRepo);
  const documentCreateTools = createDocumentCreateTools(emitDocumentUpdate);

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



  const elapsed = Date.now() - startTime;
}

/**
 */
export function getKpmServer() {
}
