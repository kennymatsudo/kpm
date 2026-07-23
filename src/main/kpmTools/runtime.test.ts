import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  KpmToolRuntime,
  KpmToolRuntimeError,
  getCurrentToolExecutionContext,
  normalizeKpmToolResult,
  toMcpToolResult,
  type KpmToolGroup,
} from './runtime';
import { createPlanChangeTools } from './tools/plan-changes';
import type { PlanAction } from '../../shared/types';
import { getKpmToolRuntime, warmupKpmToolRuntime } from './runtimeRegistry';

vi.mock('../db/connection', () => ({
  getDatabase: () => ({}),
}));

function availability(main: boolean, focusDocument: boolean) {
  return { main, focus_document: focusDocument };
}

function makeToolGroup(overrides: Partial<KpmToolGroup> = {}): KpmToolGroup {
  return {
    id: 'plan-items',
    capabilities: ['plan_items.propose'],
    availability: availability(true, false),
    tools: [
      {
        name: 'modify_plan',
        description: 'Modify the plan',
        inputSchema: { title: z.string() },
        handler: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      },
    ],
    ...overrides,
  };
}

describe('KpmToolRuntime', () => {
  it('lists tools by Chat Session scope with capability and availability metadata', () => {
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup(),
      makeToolGroup({
        id: 'documents',
        capabilities: ['documents.read'],
        availability: availability(true, true),
        tools: [{ name: 'read_project_file', description: 'Read file', inputSchema: {}, handler: vi.fn() }],
      }),
    ]);

    expect(runtime.listTools({ scope: 'main' }).map((tool) => tool.name)).toEqual([
      'modify_plan',
      'read_project_file',
    ]);
    expect(runtime.listTools({ scope: 'focus_document' }).map((tool) => tool.name)).toEqual([
      'read_project_file',
    ]);
    expect(runtime.listToolManifest({ scope: 'main' })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'modify_plan',
        capabilities: ['plan_items.propose'],
        availability: availability(true, false),
      }),
    ]));
  });

  it('executes a named tool with explicit project, Chat Session, and scope context and normalizes success results', async () => {
    let observedContext: unknown;
    const handler = vi.fn(async () => {
      observedContext = getCurrentToolExecutionContext();
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    });
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({ tools: [{ name: 'modify_plan', description: 'Modify', inputSchema: {}, handler }] }),
    ]);

    const result = await runtime.executeTool({
      name: 'modify_plan',
      args: { title: 'New title' },
      extra: { requestId: 'request-1' },
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    });

    expect(handler).toHaveBeenCalledWith({ title: 'New title' }, { requestId: 'request-1' });
    expect(observedContext).toEqual({ projectId: 'project-1', chatSessionId: 'chat-1', scope: 'main' });
    expect(result).toEqual({
      ok: true,
      content: [{ type: 'text', text: 'ok' }],
      mcpResult: { content: [{ type: 'text', text: 'ok' }] },
    });
  });

  it('executes proposal-producing handlers with explicit runtime context and callback plumbing', async () => {
    const action: PlanAction = {
      type: 'update_item',
      item_id: 'item-1',
      updates: { status_category: 'in_progress' },
    };
    const emitted: { context: unknown; actions: PlanAction[] }[] = [];
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({
        tools: createPlanChangeTools(
          (actions) => {
            emitted.push({ context: getCurrentToolExecutionContext(), actions });
          },
          { getByProject: () => [] },
        ),
      }),
    ]);

    const result = await runtime.executeTool({
      name: 'modify_plan',
      args: { message: 'Move item into progress', actions: [action] },
      extra: { requestId: 'request-plan-1' },
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    });

    expect(emitted).toEqual([{
      context: { projectId: 'project-1', chatSessionId: 'chat-1', scope: 'main' },
      actions: [action],
    }]);
    expect(result).toEqual({
      ok: true,
      content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Plan changes submitted to KPM.', actionCount: 1 }) }],
      mcpResult: { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Plan changes submitted to KPM.', actionCount: 1 }) }] },
    });
  });

  it('adds the sole connected repo to provider-proposed create_item actions', async () => {
    const emitted: PlanAction[][] = [];
    const repoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({
        tools: createPlanChangeTools(
          (actions) => emitted.push(actions),
          { getByProject: () => [{ id: repoId, project_id: 'project-1', path: '/tmp/repo' }] },
        ),
      }),
    ]);

    await runtime.executeTool({
      name: 'modify_plan',
      args: {
        message: 'Create targeted item',
        actions: [{ type: 'create_item', title: 'Targeted item', parent_id: null }],
      },
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    });

    expect(emitted).toEqual([[
      expect.objectContaining({
        type: 'create_item',
        primary_repo_id: repoId,
        affected_repo_ids: [],
      }),
    ]]);
  });

  it('rejects provider-proposed repo IDs that are not connected to the project', async () => {
    const onPlanActions = vi.fn();
    const connectedRepoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({
        tools: createPlanChangeTools(
          onPlanActions,
          { getByProject: () => [{ id: connectedRepoId, project_id: 'project-1', path: '/tmp/repo' }] },
        ),
      }),
    ]);

    const result = await runtime.executeTool({
      name: 'modify_plan',
      args: {
        message: 'Create mistargeted item',
        actions: [{
          type: 'create_item',
          title: 'Mistargeted item',
          parent_id: null,
          primary_repo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }],
      },
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected repo target validation to fail');
    expect(result.message).toContain('not connected');
    expect(onPlanActions).not.toHaveBeenCalled();
  });

  it('normalizes legacy tool error results without throwing', async () => {
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({
        tools: [{
          name: 'modify_plan',
          description: 'Modify',
          inputSchema: {},
          handler: vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'Error: invalid action' }], isError: true })),
        }],
      }),
    ]);

    await expect(runtime.executeTool({
      name: 'modify_plan',
      args: {},
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    })).resolves.toEqual({
      ok: false,
      content: [{ type: 'text', text: 'Error: invalid action' }],
      message: 'Error: invalid action',
      mcpResult: { content: [{ type: 'text', text: 'Error: invalid action' }], isError: true },
    });
  });

  it('preserves empty and provider-specific MCP result content and top-level fields for MCP adapters', () => {
    const empty = normalizeKpmToolResult({ content: [], structuredContent: { count: 0 } });
    expect(empty).toEqual({
      ok: true,
      content: [],
      mcpResult: { content: [], structuredContent: { count: 0 } },
    });
    expect(toMcpToolResult(empty)).toEqual({ content: [], structuredContent: { count: 0 } });

    const resourceBlock = { type: 'resource', resource: { uri: 'file:///tmp/example.txt', text: 'example' } };
    const error = normalizeKpmToolResult({ content: [resourceBlock], isError: true, _meta: { source: 'legacy' } });
    expect(error).toEqual({
      ok: false,
      content: [resourceBlock],
      message: 'KPM tool call failed',
      mcpResult: { content: [resourceBlock], isError: true, _meta: { source: 'legacy' } },
    });
    expect(toMcpToolResult(error)).toEqual({ content: [resourceBlock], isError: true, _meta: { source: 'legacy' } });
  });

  it('wraps thrown handler failures in typed runtime errors', async () => {
    const runtime = new KpmToolRuntime(() => [
      makeToolGroup({
        tools: [{
          name: 'modify_plan',
          description: 'Modify',
          inputSchema: {},
          handler: vi.fn(async () => {
            throw new Error('validation failed');
          }),
        }],
      }),
    ]);

    await expect(runtime.executeTool({
      name: 'modify_plan',
      args: {},
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'main',
    })).rejects.toMatchObject({
      code: 'TOOL_EXECUTION_FAILED',
      toolName: 'modify_plan',
      message: 'validation failed',
    });
  });

  it('rejects execution when the named tool is unavailable in the requested scope', async () => {
    const runtime = new KpmToolRuntime(() => [makeToolGroup()]);

    await expect(runtime.executeTool({
      name: 'modify_plan',
      args: {},
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'focus_document',
    })).rejects.toBeInstanceOf(KpmToolRuntimeError);
    await expect(runtime.executeTool({
      name: 'modify_plan',
      args: {},
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      scope: 'focus_document',
    })).rejects.toMatchObject({
      code: 'TOOL_NOT_AVAILABLE',
      toolName: 'modify_plan',
      message: 'KPM tool "modify_plan" is not available for focus_document chat sessions.',
    });
  });
});

describe('default KPM tool runtime manifest', () => {
  it('makes Plan Item proposal and document capabilities available to main Chat Sessions', () => {
    warmupKpmToolRuntime({
      container: {
        projects: {},
        planItems: {},
        planRelations: {},
        groups: {},
        repos: {},
        devSessions: {},
        confluenceLinks: {},
      } as never,
      services: {
        briefingService: {},
        fileExplorerService: {},
      } as never,
      getMainWindow: () => null,
    });

    const manifest = getKpmToolRuntime().listToolManifest({ scope: 'main' });

    expect(manifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'query_plan_items', capabilities: expect.arrayContaining(['plan_items.read']) }),
      expect.objectContaining({ name: 'modify_plan', capabilities: expect.arrayContaining(['plan_items.propose']) }),
      expect.objectContaining({ name: 'read_project_file', capabilities: expect.arrayContaining(['documents.read']) }),
      expect.objectContaining({ name: 'propose_document_edit', capabilities: expect.arrayContaining(['documents.propose']) }),
    ]));
  });

  it('intentionally excludes Plan Item proposal capability from focus-document Chat Sessions', () => {
    warmupKpmToolRuntime({
      container: {
        projects: {},
        planItems: {},
        planRelations: {},
        groups: {},
        repos: {},
        devSessions: {},
        confluenceLinks: {},
      } as never,
      services: {
        briefingService: {},
        fileExplorerService: {},
      } as never,
      getMainWindow: () => null,
    });

    const manifest = getKpmToolRuntime().listToolManifest({ scope: 'focus_document' });

    expect(manifest.map((tool) => tool.name)).not.toContain('modify_plan');
    expect(manifest.some((tool) => tool.capabilities.includes('plan_items.propose'))).toBe(false);
    expect(manifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'read_project_file', capabilities: expect.arrayContaining(['documents.read']) }),
      expect.objectContaining({ name: 'propose_document_edit', capabilities: expect.arrayContaining(['documents.propose']) }),
    ]));
  });
});
