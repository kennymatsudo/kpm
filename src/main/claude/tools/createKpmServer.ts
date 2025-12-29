/**
 *
 * The server is created once at app startup and reused across all messages.
 * Plan action callbacks are handled via an event emitter pattern.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';

import { createPlanItemTools } from './plan-items';
import { createRelationTools } from './relations';
import { createJiraTools } from './jira';
import { createStorybookTools } from './storybook';


// Event emitter for plan actions - allows per-message callbacks with singleton server
const planActionsEmitter = new EventEmitter();

const claudeMdUpdateEmitter = new EventEmitter();

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
 * Internal callback that emits to all subscribers
 */
function emitPlanActions(actions: PlanAction[]): void {
}

/**
 */
function emitClaudeMdUpdate(update: ClaudeMdUpdatePayload): void {
}

/**
 */


  const planItemTools = createPlanItemTools(planItemRepo, planRelationRepo, emitPlanActions);
  const planChangeTools = createPlanChangeTools(emitPlanActions);
  const storybookTools = createStorybookTools(projectRepo);

    ...planItemTools,
    ...relationTools,
    ...planChangeTools,
    ...jiraTools,
    ...storybookTools,
  ];



  const elapsed = Date.now() - startTime;
}

/**
 */
export function getKpmServer() {
}
