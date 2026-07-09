import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ChatSessionScope } from '../../shared/types';
import {
  executeKpmTool,
  getKpmToolDefinitions,
  warmupKpmToolRuntime,
  type KpmToolRuntimeDeps,
} from './runtimeRegistry';
import {
  getCurrentToolExecutionContext,
  toMcpToolResult,
  type KpmToolDefinition,
} from './runtime';

type ClaudeMcpToolDefinitions = Parameters<typeof createSdkMcpServer>[0]['tools'];

let cachedTools: ClaudeMcpToolDefinitions | null = null;
let cachedFocusTools: ClaudeMcpToolDefinitions | null = null;

function toProviderToolDefinitions(
  tools: KpmToolDefinition[],
  scope: ChatSessionScope,
): NonNullable<ClaudeMcpToolDefinitions> {
  return tools.map(({ name, description, inputSchema, annotations, _meta, handler }) => ({
    name,
    description,
    inputSchema,
    annotations,
    _meta,
    handler: (args: unknown, extra: unknown) => {
      const context = getCurrentToolExecutionContext();
      if (!context?.projectId) return handler(args, extra);

      return executeKpmTool({
        name,
        args,
        extra,
        projectId: context.projectId,
        chatSessionId: context.chatSessionId,
        scope: context.scope ?? scope,
      }).then(toMcpToolResult);
    },
  })) as NonNullable<ClaudeMcpToolDefinitions>;
}

function logToolDefinitionFootprint(tools: NonNullable<ClaudeMcpToolDefinitions>): void {
  const CHARS_PER_TOKEN = 4;
  const estTok = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

  const rows = tools.map((t) => {
    let schemaChars = -1;
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
    `[KPM Server] Tool-definition footprint: ${rows.length} tools, ~${totalChars.toLocaleString()} chars `
    + `(~${estTok(totalChars).toLocaleString()} est. tokens). Largest first:`
  );
  for (const r of rows) {
    const schemaNote = r.schemaChars < 0 ? 'schema n/a' : `schema ${r.schemaChars}c`;
    console.log(`  ${r.name}: ~${estTok(r.totalChars)} tok (desc ${r.descChars}c, ${schemaNote})`);
  }
}

function collectTools() {
  if (cachedTools) return cachedTools;

  const tools = toProviderToolDefinitions(getKpmToolDefinitions({ scope: 'main' }), 'main');
  cachedTools = tools;

  console.log('[KPM Server] Registered tools:', tools.map((t) => t.name).join(', '));
  logToolDefinitionFootprint(tools);
  return tools;
}

function collectFocusTools() {
  if (cachedFocusTools) return cachedFocusTools;

  const tools = toProviderToolDefinitions(getKpmToolDefinitions({ scope: 'focus_document' }), 'focus_document');
  cachedFocusTools = tools;

  console.log('[KPM Server] Registered focus tools:', tools.map((t) => t.name).join(', '));
  logToolDefinitionFootprint(tools);
  return tools;
}

/**
 * Initialize KPM tools at app startup to avoid lazy initialization delays.
 * The runtime lives in runtimeRegistry; this adapter only warms Claude MCP tool
 * definitions after the provider-neutral runtime is ready.
 */
export function warmupMcpSdk(deps: KpmToolRuntimeDeps): void {
  warmupKpmToolRuntime(deps);
  cachedTools = null;
  cachedFocusTools = null;

  console.log('[KPM Server] Initializing tools...');
  const startTime = Date.now();
  collectTools();
  collectFocusTools();
  const elapsed = Date.now() - startTime;
  console.log(`[KPM Server] Tools initialized in ${elapsed}ms`);
}

export function getKpmServer() {
  return createSdkMcpServer({
    name: 'kpm',
    version: '1.0.0',
    tools: collectTools(),
    // Ensures KPM tools are always present in Claude's context (not deferred
    // behind tool search) and that the server is connected before the first
    // turn — required since the init message would otherwise report kpm as
    // 'pending' under the SDK's background-connection default.
    alwaysLoad: true,
  });
}

export function getFocusKpmServer() {
  return createSdkMcpServer({
    name: 'kpm',
    version: '1.0.0',
    tools: collectFocusTools(),
    alwaysLoad: true,
  });
}
