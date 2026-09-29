/**
 * Tool Infrastructure for In-Process MCP Tools
 *
 * Provides utilities for creating type-safe tools using the Agent SDK.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../../config';
import { getCurrentToolExecutionContext } from '../runtime';

// Re-export for easy imports
export { tool, createSdkMcpServer };

/**
 * Per-invocation log for tool handlers. Silent unless `claude.debug` is on
 * — sync stderr writes add up under bursty edit traffic.
 */
export function toolLog(...args: unknown[]): void {
  if (getConfig().claude.debug) {
    console.log(...args);
  }
}

/**
 * Creates a standard tool result with text content
 */
export function toolResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }]
  };
}

/**
 * Creates an error result
 */
export function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true
  };
}

/**
 * Wraps a handler so it receives the chat's project from the execution context
 * rather than from the model: a model-supplied projectId costs output tokens on
 * every call and, when wrong, reads another project's data.
 */
export function projectScoped<Args, Result>(
  handler: (args: Args & { projectId: string }, extra: unknown) => Promise<Result>,
): (args: Args, extra: unknown) => Promise<Result | ReturnType<typeof toolError>> {
  return async (args, extra) => {
    const projectId = getCurrentToolExecutionContext()?.projectId;
    if (!projectId) return toolError('No project is active for this chat.');
    return handler({ ...args, projectId }, extra);
  };
}

/**
 * Safely converts data to JSON string
 */
export function toJson(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Creates a tool result with JSON data
 */
export function jsonResult(data: unknown) {
  return toolResult(toJson(data));
}
