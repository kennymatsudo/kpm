/**
 * Tool Infrastructure for In-Process MCP Tools
 *
 * Provides utilities for creating type-safe tools using the Agent SDK.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Re-export for easy imports
export { tool, createSdkMcpServer };

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
