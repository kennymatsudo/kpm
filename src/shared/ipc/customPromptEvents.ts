/**
 * Custom prompt domain event registry (main -> renderer push events).
 *
 * Covers `custom-prompt:progress`/`custom-prompt:complete`/`custom-prompt:error`,
 * streamed from `handlers/customPrompts.ts`'s `execute` endpoint during a
 * Command+K prompt run. Not invoke endpoints — see `customPromptEndpoints.ts`
 * for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface CustomPromptProgressEventData {
  taskId: string;
  message: string;
}

export interface CustomPromptCompleteEventData {
  taskId: string;
  filePath: string;
  promptName: string;
}

export interface CustomPromptErrorEventData {
  taskId: string;
  error: string;
}

export const customPromptEvents = {
  progress: { channel: 'custom-prompt:progress', payload: payloadOf<CustomPromptProgressEventData>() },
  complete: { channel: 'custom-prompt:complete', payload: payloadOf<CustomPromptCompleteEventData>() },
  error: { channel: 'custom-prompt:error', payload: payloadOf<CustomPromptErrorEventData>() },
} satisfies Record<string, EventDefinition>;

export type CustomPromptEvents = typeof customPromptEvents;
export type CustomPromptEventName = keyof CustomPromptEvents;
