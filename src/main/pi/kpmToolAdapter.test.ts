import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { buildPiKpmTools } from './kpmToolAdapter';
import type { KpmToolDefinition } from '../kpmTools/runtimeRegistry';
import { KpmToolRuntimeError, normalizeKpmToolResult } from '../kpmTools/runtime';

const getKpmToolDefinitionsMock = vi.fn<() => KpmToolDefinition[]>();
const getFocusKpmToolDefinitionsMock = vi.fn<() => KpmToolDefinition[]>();
const executeKpmToolMock = vi.fn(async (request: { name: string; args: unknown }) => {
  const tool = [...(getKpmToolDefinitionsMock() ?? []), ...(getFocusKpmToolDefinitionsMock() ?? [])]
    .find((candidate) => candidate.name === request.name);
  if (!tool) return normalizeKpmToolResult(undefined);

  return normalizeKpmToolResult(await tool.handler(request.args, {}));
});

vi.mock('../kpmTools/runtimeRegistry', () => ({
  executeKpmTool: (request: unknown) => executeKpmToolMock(request as { name: string; args: unknown }),
  getKpmToolDefinitions: (request: { scope: 'main' | 'focus_document' }) => (
    request.scope === 'focus_document' ? getFocusKpmToolDefinitionsMock() : getKpmToolDefinitionsMock()
  ),
}));

function makeKpmTool(overrides: Partial<KpmToolDefinition> = {}): KpmToolDefinition {
  return {
    name: 'modify_plan',
    description: 'Modify the plan',
    inputSchema: { title: z.string() },
    handler: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    ...overrides,
  };
}

describe('buildPiKpmTools', () => {
  it('maps a KpmToolDefinition to a pi tool whose execute runs through the scoped KPM runtime', async () => {
    const handler = vi.fn(async (args: unknown) => ({
      content: [{ type: 'text', text: `handled:${JSON.stringify(args)}` }],
    }));
    getKpmToolDefinitionsMock.mockReturnValue([makeKpmTool({ handler })]);

    const { tools, toolNames } = buildPiKpmTools({ focus: false, projectId: 'project-1', chatSessionId: 'session-1' });

    expect(toolNames).toEqual(['modify_plan']);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('modify_plan');
    expect(tools[0].description).toBe('Modify the plan');
    // inputSchema (a Zod raw shape) must be converted to JSON Schema for pi/the model provider.
    expect(tools[0].parameters).toMatchObject({ type: 'object', properties: { title: { type: 'string' } } });

    const result = await tools[0].execute('call-1', { title: 'New title' }, undefined, undefined, {});

    expect(executeKpmToolMock).toHaveBeenCalledWith({
      name: 'modify_plan',
      args: { title: 'New title' },
      extra: {},
      projectId: 'project-1',
      chatSessionId: 'session-1',
      scope: 'main',
    });
    expect(handler).toHaveBeenCalledWith({ title: 'New title' }, {});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'handled:{"title":"New title"}' }],
      details: {},
    });
  });

  it('uses the focus tool set when focus is true', () => {
    getFocusKpmToolDefinitionsMock.mockReturnValue([makeKpmTool({ name: 'read_document' })]);

    const { toolNames } = buildPiKpmTools({ focus: true, projectId: 'project-1' });

    expect(getFocusKpmToolDefinitionsMock).toHaveBeenCalled();
    expect(toolNames).toEqual(['read_document']);
  });

  it('falls back to an empty text block when no pi-supported content blocks are present', async () => {
    const handler = vi.fn(async () => ({
      content: [{ type: 'resource', resource: { uri: 'file:///tmp/example.txt', text: 'example' } }],
    }));
    getKpmToolDefinitionsMock.mockReturnValue([makeKpmTool({ handler })]);

    const { tools } = buildPiKpmTools({ focus: false, projectId: 'project-1' });

    await expect(tools[0].execute('call-1', {}, undefined, undefined, {})).resolves.toEqual({
      content: [{ type: 'text', text: '' }],
      details: {},
    });
  });

  it('throws instead of returning isError, mirroring pi tool error semantics', async () => {
    const handler = vi.fn(async () => ({
      content: [{ type: 'text', text: 'Error: item not found' }],
      isError: true,
    }));
    getKpmToolDefinitionsMock.mockReturnValue([makeKpmTool({ handler })]);

    const { tools } = buildPiKpmTools({ focus: false, projectId: 'project-1' });

    await expect(tools[0].execute('call-1', {}, undefined, undefined, {})).rejects.toThrow('Error: item not found');
  });

  it('translates typed KPM runtime errors into native pi tool errors with the same message', async () => {
    getKpmToolDefinitionsMock.mockReturnValue([makeKpmTool()]);
    executeKpmToolMock.mockRejectedValueOnce(new KpmToolRuntimeError(
      'TOOL_NOT_AVAILABLE',
      'modify_plan',
      'KPM tool "modify_plan" is not available for focus_document chat sessions.',
    ));

    const { tools } = buildPiKpmTools({ focus: false, projectId: 'project-1' });

    await expect(tools[0].execute('call-1', {}, undefined, undefined, {})).rejects.toSatisfy((error: unknown) => (
      error instanceof Error
      && !(error instanceof KpmToolRuntimeError)
      && error.message === 'KPM tool "modify_plan" is not available for focus_document chat sessions.'
    ));
  });
});
