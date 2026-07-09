/**
 * Adapts KPM's MCP-shaped tool definitions to pi's `defineTool` shape so the
 * same plan-item/document/etc. tools used by Claude and Codex chat are also
 * available to pi chat sessions. Deliberately has no import of
 * @earendil-works/pi-coding-agent (ESM-only): the returned objects are
 * structurally compatible with pi's `ToolDefinition` and are cast at the
 * point pi's real SDK is loaded (see PiChatSession.ts).
 */

import { z } from 'zod';
import {
  executeKpmTool,
  getKpmToolDefinitions,
  type KpmToolDefinition,
} from '../kpmTools/runtimeRegistry';
import { KpmToolRuntimeError } from '../kpmTools/runtime';
import type {
  KpmToolExecutionResult,
  KpmToolImageContentBlock,
  KpmToolTextContentBlock,
} from '../kpmTools/runtime';

export interface PiToolTextContent {
  type: 'text';
  text: string;
}

export interface PiToolImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type PiToolContent = PiToolTextContent | PiToolImageContent;

export interface PiToolResult {
  content: PiToolContent[];
  details: unknown;
}

/** Structurally compatible with pi's `ToolDefinition<TParams, TDetails>`. */
export interface PiKpmToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((partial: PiToolResult) => void) | undefined,
    ctx: unknown,
  ) => Promise<PiToolResult>;
}

/**
 * Translate the KPM runtime's normalized result into pi's AgentToolResult
 * shape. pi tools signal failure by throwing rather than by returning an
 * error result, so runtime-normalized tool errors are re-thrown with the
 * tool's own message.
 */
function isTextContentBlock(block: unknown): block is KpmToolTextContentBlock {
  return typeof block === 'object'
    && block !== null
    && 'type' in block
    && block.type === 'text'
    && 'text' in block
    && typeof block.text === 'string';
}

function isImageContentBlock(block: unknown): block is KpmToolImageContentBlock {
  return typeof block === 'object'
    && block !== null
    && 'type' in block
    && block.type === 'image'
    && 'data' in block
    && typeof block.data === 'string'
    && 'mimeType' in block
    && typeof block.mimeType === 'string';
}

function translateKpmResult(result: KpmToolExecutionResult): PiToolResult {
  if (!result.ok) {
    throw new Error(result.message);
  }

  const content = result.content.flatMap((block): PiToolContent[] => {
    if (isImageContentBlock(block)) {
      return [{ type: 'image', data: block.data, mimeType: block.mimeType }];
    }
    if (isTextContentBlock(block)) {
      return [{ type: 'text', text: block.text }];
    }
    return [];
  });

  return { content: content.length > 0 ? content : [{ type: 'text', text: '' }], details: {} };
}

function toPiTool(
  tool: KpmToolDefinition,
  projectId: string,
  chatSessionId: string | undefined,
  focus: boolean,
): PiKpmToolDefinition {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    // KPM tool `inputSchema` is a Zod raw shape (the MCP/Codex path converts it
    // via `registerTool`); pi forwards `parameters` to the model provider as-is,
    // so it must be real JSON Schema or the provider rejects the function.
    parameters: z.toJSONSchema(z.object(tool.inputSchema), { unrepresentable: 'any' }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await executeKpmTool({
          name: tool.name,
          args: params,
          extra: {},
          projectId,
          chatSessionId,
          scope: focus ? 'focus_document' : 'main',
        });
        return translateKpmResult(result);
      } catch (error) {
        if (error instanceof KpmToolRuntimeError) {
          throw new Error(error.message, { cause: error });
        }
        throw error;
      }
    },
  };
}

/** Build the KPM tool set (and its names) for a pi chat session. Pure — reuses the already-warmed-up KPM tool registry. */
export function buildPiKpmTools(options: {
  focus: boolean;
  projectId: string;
  chatSessionId?: string;
}): { tools: PiKpmToolDefinition[]; toolNames: string[] } {
  const definitions = getKpmToolDefinitions({ scope: options.focus ? 'focus_document' : 'main' });
  const tools = definitions.map((tool) => toPiTool(tool, options.projectId, options.chatSessionId, options.focus));
  return { tools, toolNames: tools.map((tool) => tool.name) };
}
