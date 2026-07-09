import { AsyncLocalStorage } from 'async_hooks';
import type { ChatSessionScope } from '../../shared/types';
import type { KpmToolProposalSink } from './proposals';

export interface KpmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // Mirrors the Claude SDK tool definition shape; argument schemas vary per
  // tool, so the runtime keeps the implementation signature intentionally
  // generic while preserving each tool's original handler.
  annotations?: any;
  _meta?: Record<string, unknown>;
  handler: (args: any, extra: any) => Promise<any>;
}

export interface KpmToolTextContentBlock {
  type: 'text';
  text: string;
}

export interface KpmToolImageContentBlock {
  type: 'image';
  data: string;
  mimeType: string;
}

export type KpmToolContentBlock = unknown;

export interface ProviderMcpToolResult {
  content: KpmToolContentBlock[];
  isError?: boolean;
  [key: string]: unknown;
}

export type KpmToolExecutionResult =
  | { ok: true; content: KpmToolContentBlock[]; mcpResult: ProviderMcpToolResult }
  | { ok: false; content: KpmToolContentBlock[]; message: string; mcpResult: ProviderMcpToolResult };

export type KpmToolRuntimeErrorCode = 'TOOL_NOT_AVAILABLE' | 'TOOL_EXECUTION_FAILED';

export class KpmToolRuntimeError extends Error {
  constructor(
    readonly code: KpmToolRuntimeErrorCode,
    readonly toolName: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'KpmToolRuntimeError';
  }
}

export type KpmToolCapability =
  | 'plan_items.read'
  | 'plan_items.propose'
  | 'plan_relations.read'
  | 'groups.read'
  | 'documents.read'
  | 'documents.propose'
  | 'project_context.propose'
  | 'project_files.read'
  | 'plan_refs.read'
  | 'repo.read'
  | 'integrations.read'
  | 'briefing.read'
  | 'file_changes.propose'
  | 'spill.read';

export type KpmToolAvailability = Record<ChatSessionScope, boolean>;

export interface KpmToolMetadata {
  capabilities: KpmToolCapability[];
  availability: KpmToolAvailability;
}

export interface KpmRuntimeTool extends KpmToolDefinition, KpmToolMetadata {}

export interface KpmToolManifestEntry extends KpmToolMetadata {
  name: string;
  description: string;
}

export interface KpmToolGroup {
  id: string;
  capabilities: KpmToolCapability[];
  availability: KpmToolAvailability;
  tools: KpmToolDefinition[];
}

export interface ToolExecutionContext {
  projectId: string;
  chatSessionId?: string;
  scope?: ChatSessionScope;
  proposalSink?: KpmToolProposalSink;
}

export interface KpmToolExecutionRequest {
  name: string;
  args: unknown;
  extra?: unknown;
  projectId: string;
  chatSessionId?: string;
  scope: ChatSessionScope;
}

export interface KpmToolListRequest {
  scope: ChatSessionScope;
}

const toolExecutionContext = new AsyncLocalStorage<ToolExecutionContext>();

export function runWithToolExecutionContext<T>(
  context: ToolExecutionContext,
  fn: () => T
): T {
  return toolExecutionContext.run(context, fn);
}

export function getCurrentToolExecutionContext(): ToolExecutionContext | undefined {
  return toolExecutionContext.getStore();
}

export function getCurrentKpmToolProposalSink(): KpmToolProposalSink | undefined {
  return toolExecutionContext.getStore()?.proposalSink;
}

function isAvailableInScope(group: KpmToolGroup, scope: ChatSessionScope): boolean {
  return group.availability[scope];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextContentBlock(block: unknown): block is KpmToolTextContentBlock {
  return isRecord(block) && block.type === 'text' && typeof block.text === 'string';
}

function textContent(text: string): KpmToolTextContentBlock[] {
  return [{ type: 'text', text }];
}

function normalizeMcpToolResult(rawResult: unknown): ProviderMcpToolResult {
  if (isRecord(rawResult) && Array.isArray(rawResult.content)) {
    return { ...rawResult, content: [...rawResult.content] };
  }

  if (typeof rawResult === 'string') return { content: textContent(rawResult) };
  if (rawResult === undefined || rawResult === null) return { content: textContent('') };

  return { content: textContent(JSON.stringify(rawResult)) };
}

function errorMessageFromContent(content: KpmToolContentBlock[]): string {
  return content.find(isTextContentBlock)?.text ?? 'KPM tool call failed';
}

function errorMessageFromThrown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeKpmToolResult(rawResult: unknown): KpmToolExecutionResult {
  const mcpResult = normalizeMcpToolResult(rawResult);
  const content = mcpResult.content;
  if (isRecord(rawResult) && rawResult.isError === true) {
    return { ok: false, content, message: errorMessageFromContent(content), mcpResult };
  }
  return { ok: true, content, mcpResult };
}

export function toMcpToolResult(result: KpmToolExecutionResult): ProviderMcpToolResult {
  if (result.ok) return result.mcpResult;
  return { ...result.mcpResult, isError: true };
}

export class KpmToolRuntime {
  private cachedToolGroups: KpmToolGroup[] | null = null;

  constructor(
    private readonly getToolGroups: () => KpmToolGroup[],
    private readonly proposalSink?: KpmToolProposalSink,
  ) {}

  private toolGroups(): KpmToolGroup[] {
    if (!this.cachedToolGroups) {
      this.cachedToolGroups = this.getToolGroups();
    }
    return this.cachedToolGroups;
  }

  listTools(request: KpmToolListRequest): KpmRuntimeTool[] {
    return this.toolGroups()
      .filter((group) => isAvailableInScope(group, request.scope))
      .flatMap((group) => group.tools.map((tool) => ({
        ...tool,
        capabilities: group.capabilities,
        availability: group.availability,
      })));
  }

  listToolManifest(request?: Partial<KpmToolListRequest>): KpmToolManifestEntry[] {
    return this.toolGroups()
      .filter((group) => request?.scope ? isAvailableInScope(group, request.scope) : true)
      .flatMap((group) => group.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        capabilities: group.capabilities,
        availability: group.availability,
      })));
  }

  async executeTool(request: KpmToolExecutionRequest): Promise<KpmToolExecutionResult> {
    const tool = this.listTools({ scope: request.scope }).find((candidate) => candidate.name === request.name);
    if (!tool) {
      throw new KpmToolRuntimeError(
        'TOOL_NOT_AVAILABLE',
        request.name,
        `KPM tool "${request.name}" is not available for ${request.scope} chat sessions.`,
      );
    }

    try {
      const rawResult = await runWithToolExecutionContext(
        {
          projectId: request.projectId,
          chatSessionId: request.chatSessionId,
          scope: request.scope,
          proposalSink: this.proposalSink,
        },
        () => tool.handler(request.args, request.extra ?? {}),
      );
      return normalizeKpmToolResult(rawResult);
    } catch (error) {
      if (error instanceof KpmToolRuntimeError) throw error;
      throw new KpmToolRuntimeError(
        'TOOL_EXECUTION_FAILED',
        request.name,
        errorMessageFromThrown(error),
        error,
      );
    }
  }
}
