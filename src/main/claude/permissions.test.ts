/**
 * Permissions Unit Tests
 *
 * Tests the permission control logic for Claude SDK tool usage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createKpmToolHook,
  createPermissionPrompt,
  evaluateKpmToolCall,
  extractPath,
  isWithinDirectory,
  type PermissionContext,
  type PromptUserFn,
} from './permissions';

/**
 * Helper to create test options with required fields
 */
function createTestOptions(): { signal: AbortSignal; toolUseID: string; requestId: string } {
  return {
    signal: new AbortController().signal,
    toolUseID: 'test-tool-use-id',
    requestId: 'test-request-id',
  };
}

// The SDK's view of evaluateKpmToolCall: a denial, or no decision from KPM.
function buildHandler(context: PermissionContext, _promptUser: PromptUserFn) {
  return async (toolName: string, input: Record<string, unknown>, _options: ReturnType<typeof createTestOptions>) => {
    const denial = await evaluateKpmToolCall(context, toolName, input);
    return denial ? { behavior: 'deny' as const, message: denial } : { behavior: 'undecided' as const };
  };
}

describe('permissions', () => {
  describe('extractPath', () => {
    it('extracts paths from file and search tools', () => {
      for (const [toolName, input, expected] of [
        ['Read', { file_path: '/path/to/file.ts' }, '/path/to/file.ts'],
        ['Edit', { file_path: '/path/to/file.ts', old: 'x', new: 'y' }, '/path/to/file.ts'],
        ['Write', { file_path: '/path/to/file.ts', content: 'hello' }, '/path/to/file.ts'],
        ['Grep', { path: '/search/path', pattern: 'foo' }, '/search/path'],
        ['Glob', { path: '/search/path', pattern: '*.ts' }, '/search/path'],
        ['NotebookEdit', { notebook_path: '/path/to/nb.ipynb', new_source: 'x' }, '/path/to/nb.ipynb'],
      ] as const) {
        expect(extractPath(toolName, input)).toBe(expected);
      }
    });

    it('returns null when a tool has no usable string path', () => {
      for (const [toolName, input] of [
        ['Read', {}],
        ['Read', { file_path: 123 }],
        ['UnknownTool', { file_path: '/path' }],
      ] as const) {
        expect(extractPath(toolName, input)).toBeNull();
      }
    });
  });

  describe('isWithinDirectory', () => {
    it('accepts files inside the directory or the directory itself', () => {
      for (const [targetPath, directory] of [
        ['/project/src/file.ts', '/project'],
        ['/project/src/deep/nested/file.ts', '/project'],
        ['/project', '/project'],
      ] as const) {
        expect(isWithinDirectory(targetPath, directory)).toBe(true);
      }
    });

    it('rejects parent, sibling, and partial-name paths', () => {
      for (const [targetPath, directory] of [
        ['/parent', '/parent/child'],
        ['/other/file.ts', '/project'],
        ['/project-other/file.ts', '/project'],
      ] as const) {
        expect(isWithinDirectory(targetPath, directory)).toBe(false);
      }
    });
  });

  describe('evaluateKpmToolCall', () => {
    let context: PermissionContext;
    let mockPromptUser: ReturnType<typeof vi.fn> & PromptUserFn;
    let handler: ReturnType<typeof buildHandler>;

    beforeEach(() => {
      vi.clearAllMocks();
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
      };
      mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      handler = buildHandler(context, mockPromptUser);
    });

    it('leaves reads, shell commands, and other MCP tools to the user\'s permissions', async () => {
      for (const [toolName, input] of [
        ['Read', { file_path: '/Users/me/.ssh/id_rsa' }],
        ['Bash', { command: 'git fetch' }],
        ['mcp__slack__search', { query: 'hello' }],
      ] as const) {
        expect(await handler(toolName, input, createTestOptions())).toEqual({ behavior: 'undecided' });
      }
    });

      it('denies tools from MCP servers disabled in KPM settings', async () => {
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        disabledMcpServerNames: ['claude.ai Slack'],
      };
      handler = buildHandler(context, mockPromptUser);

      for (const toolName of ['mcp__slack__search', 'mcp__claude-ai-slack__search']) {
        const result = await handler(toolName, { query: 'hello' }, createTestOptions());

        expect(result).toMatchObject({
          behavior: 'deny',
          message: 'The claude.ai Slack MCP server is disabled in KPM settings.',
        });
      }
      expect(mockPromptUser).not.toHaveBeenCalled();
    });

  describe('project file write interception', () => {
    it('intercepts Write to project context files and routes them through context approval', async () => {
      const mockOnContextFileEdit = vi.fn();
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onContextFileEdit: mockOnContextFileEdit,
      };
      handler = buildHandler(context, mockPromptUser);

      for (const filename of ['AGENTS.md', 'CLAUDE.md']) {
        const result = await handler(
          'Write',
          { file_path: `/test/project/${filename}`, content: '# Updated context' },
          createTestOptions()
        );

        expect(result.behavior).toBe('deny');
        expect(mockOnContextFileEdit).toHaveBeenCalledWith('test-project-id', '# Updated context');
      }
      expect(mockPromptUser).not.toHaveBeenCalled();
    });

    it('intercepts Edit to project context files by applying old_string→new_string and routing the full content', async () => {
      const mockOnContextFileEdit = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('# Context\n\nalpha beta gamma');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onContextFileEdit: mockOnContextFileEdit,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      for (const filename of ['AGENTS.md', 'CLAUDE.md']) {
        mockOnContextFileEdit.mockClear();
        const result = await handler(
          'Edit',
          { file_path: `/test/project/${filename}`, old_string: 'beta', new_string: 'BETA' },
          createTestOptions()
        );

        expect(result).toMatchObject({
          behavior: 'deny',
          message: 'Project context file update captured by KPM.',
        });
        expect(mockOnContextFileEdit).toHaveBeenCalledWith('test-project-id', '# Context\n\nalpha BETA gamma');
      }
      expect(mockPromptUser).not.toHaveBeenCalled();
    });

    it('denies Edit on context file when old_string is not found', async () => {
      const mockOnContextFileEdit = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('nothing matches here');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onContextFileEdit: mockOnContextFileEdit,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler(
        'Edit',
        { file_path: '/test/project/AGENTS.md', old_string: 'missing', new_string: 'replacement' },
        createTestOptions()
      );

      expect(result).toMatchObject({
        behavior: 'deny',
        message: 'old_string not found in the project context file. Read the file first and copy exact text including whitespace.',
      });
      expect(mockOnContextFileEdit).not.toHaveBeenCalled();
    });

    it('denies Edit on context file when old_string is not unique', async () => {
      const mockOnContextFileEdit = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('foo bar foo');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onContextFileEdit: mockOnContextFileEdit,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler(
        'Edit',
        { file_path: '/test/project/AGENTS.md', old_string: 'foo', new_string: 'baz' },
        createTestOptions()
      );

      expect(result).toMatchObject({
        behavior: 'deny',
        message: 'old_string appears multiple times in the project context file. Include more surrounding context to make the match unique.',
      });
      expect(mockOnContextFileEdit).not.toHaveBeenCalled();
    });

    it('stacks sequential Edit calls to the context file via the pending cache instead of reading stale disk', async () => {
      const mockOnContextFileEdit = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('alpha beta gamma');
      const pending: { content?: string } = {};
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onContextFileEdit: mockOnContextFileEdit,
        readProjectFile: mockReadFile,
        peekPendingFile: () => pending.content,
      };
      handler = buildHandler(context, mockPromptUser);

      const first = await handler(
        'Edit',
        { file_path: '/test/project/AGENTS.md', old_string: 'beta', new_string: 'BETA' },
        createTestOptions()
      );
      expect(first.behavior).toBe('deny');
      expect(mockOnContextFileEdit).toHaveBeenCalledWith('test-project-id', 'alpha BETA gamma');

      // Simulate the wiring that records onContextFileEdit's output into the
      // pending cache so the next Edit sees it instead of stale disk.
      pending.content = 'alpha BETA gamma';

      const second = await handler(
        'Edit',
        { file_path: '/test/project/AGENTS.md', old_string: 'gamma', new_string: 'GAMMA' },
        createTestOptions()
      );
      expect(second.behavior).toBe('deny');
      expect(mockOnContextFileEdit).toHaveBeenCalledWith('test-project-id', 'alpha BETA GAMMA');
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('intercepts Write to project directory when callback provided', async () => {
      const mockOnProjectFileWrite = vi.fn();
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onProjectFileWrite: mockOnProjectFileWrite,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler('Write', { file_path: '/test/project/docs/guide.md', content: 'Hello world' }, createTestOptions());

      expect(result.behavior).toBe('deny');
      expect(mockOnProjectFileWrite).toHaveBeenCalledWith('test-project-id', 'docs/guide.md', 'Hello world');
      expect(mockPromptUser).not.toHaveBeenCalled();
    });

    it('leaves a project file write to the user\'s permissions when no interceptor is available', async () => {
      const result = await handler(
        'Write',
        { file_path: '/test/project/docs/guide.md', content: 'Hello world' },
        createTestOptions()
      );

      expect(result.behavior).toBe('undecided');
    });

    it('intercepts Edit to project directory by applying old_string→new_string and routing the full content', async () => {
      const mockOnProjectFileWrite = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('alpha beta gamma');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onProjectFileWrite: mockOnProjectFileWrite,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler(
        'Edit',
        { file_path: '/test/project/docs/guide.md', old_string: 'beta', new_string: 'BETA' },
        createTestOptions()
      );

      expect(result.behavior).toBe('deny');
      expect(mockReadFile).toHaveBeenCalledWith('/test/project/docs/guide.md');
      expect(mockOnProjectFileWrite).toHaveBeenCalledWith('test-project-id', 'docs/guide.md', 'alpha BETA gamma');
      expect(mockPromptUser).not.toHaveBeenCalled();
    });

    it('denies Edit on project file when old_string is not unique', async () => {
      const mockOnProjectFileWrite = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('foo bar foo');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onProjectFileWrite: mockOnProjectFileWrite,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler(
        'Edit',
        { file_path: '/test/project/notes.md', old_string: 'foo', new_string: 'baz' },
        createTestOptions()
      );

      expect(result.behavior).toBe('deny');
      expect(mockOnProjectFileWrite).not.toHaveBeenCalled();
    });

    it('denies Edit on project file when old_string is missing from file', async () => {
      const mockOnProjectFileWrite = vi.fn();
      const mockReadFile = vi.fn().mockResolvedValue('nothing matches here');
      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
        onProjectFileWrite: mockOnProjectFileWrite,
        readProjectFile: mockReadFile,
      };
      handler = buildHandler(context, mockPromptUser);

      const result = await handler(
        'Edit',
        { file_path: '/test/project/notes.md', old_string: 'missing', new_string: 'replacement' },
        createTestOptions()
      );

      expect(result.behavior).toBe('deny');
      expect(mockOnProjectFileWrite).not.toHaveBeenCalled();
    });
    });
  });

  describe('createKpmToolHook', () => {
    it('denies a captured project file write in any permission mode', async () => {
      const onProjectFileWrite = vi.fn();
      const [hook] = createKpmToolHook({ projectPath: '/test/project', projectId: 'p1', onProjectFileWrite }).hooks;
      const output = await hook({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/test/project/notes.md', content: 'hi' },
        tool_use_id: 't1',
        session_id: 's1',
        transcript_path: '',
        cwd: '/test/project',
      } as never, 't1', { signal: new AbortController().signal });

      expect(output).toEqual({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'File update captured by KPM.' },
      });
      expect(onProjectFileWrite).toHaveBeenCalledWith('p1', 'notes.md', 'hi');
    });

    it.each([
      ['allows KPM tools without asking', 'mcp__kpm__search_plan', { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }],
      ['leaves other tools to the user\'s permissions', 'mcp__github__get_issue', { continue: true }],
      ['leaves built-in tools to the user\'s permissions', 'Bash', { continue: true }],
    ])('%s', async (_name, toolName, expected) => {
      const [hook] = createKpmToolHook({ projectPath: '/test/project', projectId: 'p1' }).hooks;
      const output = await hook({
        hook_event_name: 'PreToolUse',
        tool_name: toolName,
        tool_input: { command: 'ls' },
        tool_use_id: 't1',
        session_id: 's1',
        transcript_path: '',
        cwd: '/test/project',
      } as never, 't1', { signal: new AbortController().signal });

      expect(output).toEqual(expected);
    });
  });

  describe('createPermissionPrompt', () => {
    it('asks the user about each call their Claude Code settings ask about', async () => {
      const promptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      const prompt = createPermissionPrompt({ projectPath: '/test/project', projectId: 'p1', chatSessionId: 'chat-1' }, promptUser);

      const result = await prompt('Bash', { command: 'git fetch' }, createTestOptions());

      expect(result).toEqual({ behavior: 'allow', updatedInput: { command: 'git fetch' } });
      expect(promptUser).toHaveBeenCalledWith('Bash', { command: 'git fetch' }, expect.objectContaining({ chatSessionId: 'chat-1', kind: 'elicitation' }));
    });

    it('passes the user\'s refusal back to Claude', async () => {
      const promptUser = vi.fn().mockResolvedValue({ behavior: 'deny', message: 'User denied' });
      const prompt = createPermissionPrompt({ projectPath: '/test/project', projectId: 'p1', chatSessionId: 'chat-1' }, promptUser);

      expect(await prompt('Bash', { command: 'rm -rf build' }, createTestOptions())).toEqual({ behavior: 'deny', message: 'User denied' });
    });

    it('denies without asking when the run has no chat to ask in', async () => {
      const promptUser = vi.fn();
      const prompt = createPermissionPrompt({ projectPath: '/test/project', projectId: 'p1' }, promptUser);

      const result = await prompt('Bash', { command: 'git fetch' }, createTestOptions());

      expect(result?.behavior).toBe('deny');
      expect(promptUser).not.toHaveBeenCalled();
    });
  });
});
