import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config';
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
  type KpmToolCapability,
  type KpmToolDefinition,
} from './runtime';
import { toKpmToolInputJsonSchema } from './toolInputSchema';
import { toolError } from './tools';

type ClaudeMcpToolDefinitions = Parameters<typeof createSdkMcpServer>[0]['tools'];

/**
 * Tools chat reaches for in a small share of sessions. Claude sees only their
 * names until it looks one up through tool search, which spares every API call
 * their full schemas; the rest load up front so common work never waits on a
 * search. Picked from real chat usage, not guessed. Codex and pi load every
 * tool regardless.
 */
export const DEFERRED_KPM_TOOLS: ReadonlySet<string> = new Set([
  'bulk_modify_plan',
  'propose_config_change',
  'read_config',
  'get_pr_context',
  'list_worktrees',
  'get_enriched_relations',
  'move_project_file',
  'delete_project_file',
  'list_document_plan_refs',
  'get_confluence_url',
  'jira_list_projects',
  'jira_search',
  'jira_get_issue',
  'jira_compare_plan',
]);

const ALWAYS_LOAD_META = { 'anthropic/alwaysLoad': true } as const;

// Keyed by the listed tool names, because which tools list can change while
// the app runs (Jira credentials added or removed).
const cachedProviderTools = new Map<string, NonNullable<ClaudeMcpToolDefinitions>>();

function toProviderToolDefinitions(
  tools: KpmToolDefinition[],
  scope: ChatSessionScope,
): NonNullable<ClaudeMcpToolDefinitions> {
  return tools.map(({ name, description, inputSchema, annotations, _meta }) => ({
    name,
    description,
    inputSchema,
    annotations,
    _meta: DEFERRED_KPM_TOOLS.has(name) ? _meta : { ...ALWAYS_LOAD_META, ..._meta },
    handler: (args: unknown, extra: unknown) => {
      const context = getCurrentToolExecutionContext();
      // Every production path (chat sessions, action runs) sets a context. The
      // raw handler would skip the scope and grant checks, so refuse instead.
      if (!context?.projectId) return Promise.resolve(toolError('No project is active for this chat.'));

      return executeKpmTool({
        name,
        args,
        extra,
        projectId: context.projectId,
        chatSessionId: context.chatSessionId,
        scope: context.scope ?? scope,
        // Re-checked at execution, not just at listing, so a tool the model
        // names anyway is still refused.
        grantedCapabilities: context.grantedCapabilities,
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
      const jsonSchema = toKpmToolInputJsonSchema(t.inputSchema);
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

function providerTools(definitions: KpmToolDefinition[], scope: ChatSessionScope, label: string) {
  const key = `${scope}:${definitions.map((tool) => tool.name).join(',')}`;
  let tools = cachedProviderTools.get(key);
  if (!tools) {
    tools = toProviderToolDefinitions(definitions, scope);
    cachedProviderTools.set(key, tools);
    if (getConfig().claude.debug) {
      console.log(`[KPM Server] Registered ${label}:`, tools.map((t) => t.name).join(', '));
      logToolDefinitionFootprint(tools);
    }
  }
  return tools;
}

function collectTools() {
  return providerTools(getKpmToolDefinitions({ scope: 'main' }), 'main', 'tools');
}

function collectFocusTools() {
  return providerTools(getKpmToolDefinitions({ scope: 'focus_document' }), 'focus_document', 'focus tools');
}

/**
 * Initialize KPM tools at app startup to avoid lazy initialization delays.
 * The runtime lives in runtimeRegistry; this adapter only warms Claude MCP tool
 * definitions after the provider-neutral runtime is ready.
 */
export function warmupMcpSdk(deps: KpmToolRuntimeDeps): void {
  warmupKpmToolRuntime(deps);
  cachedProviderTools.clear();

  const startTime = Date.now();
  const tools = collectTools();
  const focusTools = collectFocusTools();
  const elapsed = Date.now() - startTime;
  console.log(`[KPM Server] ${tools.length} tools ready (${focusTools.length} in focus mode) in ${elapsed}ms`);
}

// Each tool carries its own always-load flag (see DEFERRED_KPM_TOOLS), so the
// servers set none: a server-wide flag would load the deferred tools too.
export function getKpmServer() {
  return createSdkMcpServer({ name: 'kpm', version: '1.0.0', tools: collectTools() });
}

export function getFocusKpmServer() {
  return createSdkMcpServer({ name: 'kpm', version: '1.0.0', tools: collectFocusTools() });
}

/**
 * A server exposing only the tools a granted capability set reaches — used by
 * action runs, where the grant is the boundary.
 */
export function getGrantedKpmServer(grantedCapabilities: readonly KpmToolCapability[]) {
  return createSdkMcpServer({
    name: 'kpm',
    version: '1.0.0',
    tools: providerTools(getKpmToolDefinitions({ scope: 'main', grantedCapabilities }), 'main', 'granted tools'),
  });
}
