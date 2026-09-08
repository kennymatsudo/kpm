/**
 * Permissions Unit Tests
 *
 * Tests the permission control logic for Claude SDK tool usage.
 */

import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPermissionHandler,
  extractPath,
  isWithinDirectory,
  type PermissionContext,
  type PromptUserFn,
} from './permissions';
import {
  createProjectWriteGrants,
  type ProjectWriteGrants,
} from '../chat/writeGrants';

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

// createPermissionHandler's return type (the SDK's CanUseTool) allows a null
// result to suppress the control response; KPM never uses it, so narrow it here.
let writeGrants: ProjectWriteGrants = createProjectWriteGrants();

async function enableWrites(projectId: string): Promise<void> {
  await writeGrants.request(projectId, () => Promise.resolve(true));
}

function buildHandler(context: PermissionContext, promptUser: PromptUserFn) {
  const inner = createPermissionHandler(context, promptUser, writeGrants);
  return async (...args: Parameters<typeof inner>) => {
    const result = await inner(...args);
    if (result === null) throw new Error('permission handler returned null');
    return result;
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

  describe('createPermissionHandler', () => {
    let context: PermissionContext;
    let mockPromptUser: ReturnType<typeof vi.fn> & PromptUserFn;
    let handler: ReturnType<typeof buildHandler>;

    beforeEach(() => {
      vi.clearAllMocks();
      writeGrants = createProjectWriteGrants();

      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
      };

      mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      handler = buildHandler(context, mockPromptUser);
    });

    describe('auto-allow rules', () => {
      it('asks for the write grant before Edit when no project interceptor is available', async () => {
        const result = await handler('Edit', { file_path: '/test/project/src/file.ts' }, createTestOptions());

        expect(result.behavior).toBe('allow'); // mockPromptUser resolves to allow
        expect(mockPromptUser).toHaveBeenCalledTimes(1);
      });

      it('auto-allows Read in project directory', async () => {
        const result = await handler('Read', { file_path: '/test/project/src/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Read with a relative path inside the project', async () => {
        const result = await handler('Read', { file_path: 'src/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Read outside project and connected repos', async () => {
        const result = await handler('Read', { file_path: '/outside/project/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Read with a relative path that escapes the project', async () => {
        const result = await handler('Read', { file_path: '../outside/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows shell-home Read paths outside connected scope', async () => {
        const result = await handler('Read', { file_path: '~/notes.txt' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Grep outside project and connected repos', async () => {
        const result = await handler('Grep', { path: '/outside/project', pattern: 'foo' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Glob outside project and connected repos', async () => {
        const result = await handler('Glob', { path: '/outside/project', pattern: '*.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Grep without an explicit path (resolves from cwd)', async () => {
        const result = await handler('Grep', { pattern: 'foo' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('auto-allows MCP tools', async () => {
        const result = await handler('mcp__kpm__query_plan_items', { projectId: 'test' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies disabled external MCP server tools before prompting', async () => {
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

      it('does not auto-allow Bash even when extracted path is in project', async () => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);

        await handler(
          'Bash',
          { command: 'cat ./README.md; cat ~/.ssh/id_rsa' },
          createTestOptions()
        );

        expect(mockPromptUser).toHaveBeenCalled();
      });
    });

    describe('write tools outside project', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);
      });

      it('prompts for Edit outside project', async () => {
        await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
      });

      it('prompts for Write outside project', async () => {
        await handler('Write', { file_path: '/outside/project/file.ts', content: 'hello' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
      });

      it('prompts for Bash (write tool)', async () => {
        await handler('Bash', { command: 'rm -rf /outside' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
      });

      it('returns user decision for write tools', async () => {
        mockPromptUser = vi.fn().mockResolvedValue({
          behavior: 'deny',
          updatedInput: {},
        });
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());

        expect(result.behavior).toBe('deny');
      });
    });

    describe('raw git in Bash (write consent)', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);
      });

      it('asks for conversation write access before running any git', async () => {
        const result = await handler('Bash', { command: 'git commit -m "fix"' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
        expect(result.behavior).toBe('allow');
      });

      it('runs git without asking again once writes are enabled', async () => {
        await enableWrites('test-project-id');

        const result = await handler('Bash', { command: 'git push origin main' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('asks before a git command that writes', async () => {
        await handler('Bash', { command: 'git commit --amend' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalled();
      });

      it('runs read-only git without asking at all', async () => {
        for (const command of [
          'git status --short',
          'git log --oneline -20 | head -5',
          'git diff HEAD~1 --stat',
          'git -C /repos/shared-lib rev-parse --abbrev-ref HEAD',
        ]) {
          const result = await handler('Bash', { command }, createTestOptions());

          expect(result.behavior).toBe('allow');
        }
        expect(mockPromptUser).not.toHaveBeenCalled();
        expect(writeGrants.has('test-project-id')).toBe(false);
      });

      it('runs read-only git even with no chat session to grant against', async () => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
        };
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('Bash', { command: 'git status' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies the write when the user declines', async () => {
        mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'deny', message: 'no' });
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('Bash', { command: 'git commit -m "fix"' }, createTestOptions());

        expect(result.behavior).toBe('deny');
        expect(writeGrants.has('test-project-id')).toBe(false);
      });

      it('uses one grant for git commands in any repository', async () => {
        await enableWrites('test-project-id');

        const result = await handler(
          'Bash',
          { command: 'git -C /repos/shared-lib commit -m x' },
          createTestOptions()
        );

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('uses the project grant on a run with no chat session', async () => {
        await enableWrites('test-project-id');
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
        };
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('Bash', { command: 'git commit -m x' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('still allows non-git Bash to follow normal rules (prompts)', async () => {
        await handler('Bash', { command: 'ls -la' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
      });
    });

    describe('unknown tools', () => {
      it('allows an unknown tool without asking, since it can neither write nor read secrets', async () => {
        const result = await handler('SomeNewTool', { data: 'whatever' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows WebFetch without prompting (network discovery)', async () => {
        const result = await handler('WebFetch', { url: 'https://example.com' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows WebSearch without prompting (network discovery)', async () => {
        const result = await handler('WebSearch', { query: 'how to foo' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });
    });

    describe('credential denylist on reads', () => {
      it('denies Read of ~/.ssh/id_rsa (home-expanded credential path)', async () => {
        const result = await handler('Read', { file_path: '~/.ssh/id_rsa' }, createTestOptions());
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies Read of an absolute ~/.aws credentials path', async () => {
        const awsCreds = path.join(os.homedir(), '.aws', 'credentials');
        const result = await handler('Read', { file_path: awsCreds }, createTestOptions());
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies Grep into a credential root', async () => {
        const result = await handler(
          'Grep',
          { path: path.join(os.homedir(), '.ssh'), pattern: 'PRIVATE' },
          createTestOptions()
        );
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Read of a normal source file outside the project', async () => {
        const result = await handler('Read', { file_path: '/outside/project/src/index.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Grep with no path even though it searches cwd', async () => {
        const result = await handler('Grep', { pattern: 'TODO' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });
    });

    describe('notebook and multi-edit write tools', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);
      });

      it('asks for conversation write access before NotebookEdit', async () => {
        const result = await handler(
          'NotebookEdit',
          { notebook_path: '/repos/my-app/analysis.ipynb', new_source: 'x' },
          createTestOptions()
        );
        expect(mockPromptUser).toHaveBeenCalled();
        expect(result.behavior).toBe('allow');
      });

      it('gates MultiEdit into a connected repo rather than letting it through', async () => {
        const result = await handler(
          'MultiEdit',
          { file_path: '/repos/my-app/src/index.ts', edits: [] },
          createTestOptions()
        );
        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
        expect(result.behavior).toBe('allow');
      });

      it('prompts for NotebookEdit into the project directory (never silently allowed)', async () => {
        const result = await handler(
          'NotebookEdit',
          { notebook_path: '/test/project/analysis.ipynb', new_source: 'x' },
          createTestOptions()
        );
        expect(mockPromptUser).toHaveBeenCalled();
        expect(result.behavior).toBe('allow'); // mockPromptUser resolves to allow
      });

      it('prompts for NotebookEdit outside project and repos', async () => {
        await handler(
          'NotebookEdit',
          { notebook_path: '/somewhere/else/nb.ipynb', new_source: 'x' },
          createTestOptions()
        );
        expect(mockPromptUser).toHaveBeenCalled();
      });
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

      it('requires conversation write access when no project interceptor is available', async () => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);

        const result = await handler(
          'Write',
          { file_path: '/test/project/docs/guide.md', content: 'Hello world' },
          createTestOptions()
        );

        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
        expect(result.behavior).toBe('allow');
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

    describe('project-wide write consent', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          chatSessionId: 'chat-1',
        };
        handler = buildHandler(context, mockPromptUser);
      });

      it('asks before the first write in a project', async () => {
        const result = await handler('Write', { file_path: '/repos/my-app/docs/file.md', content: 'hello' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
        expect(result.behavior).toBe('allow');
      });

      it('does not hand the SDK static rules that would bypass revocation', async () => {
        const result = await handler('Write', { file_path: '/repos/my-app/docs/file.md', content: 'hello' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        if (result.behavior !== 'allow') return;
        expect(result.updatedPermissions).toBeUndefined();
      });

      it('preserves the original tool input on allow', async () => {
        const input = { file_path: '/repos/my-app/docs/file.md', content: 'hello' };
        const result = await handler('Write', input, createTestOptions());

        expect(result.behavior).toBe('allow');
        if (result.behavior === 'allow') expect(result.updatedInput).toEqual(input);
      });

      it('records the grant and stops asking for later writes at other paths', async () => {
        await handler('Write', { file_path: '/repos/my-app/a.md', content: 'x' }, createTestOptions());
        await handler('Edit', { file_path: '/repos/shared-lib/b.ts' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(writeGrants.has('test-project-id')).toBe(true);
      });

      it('uses the grant for writes in any repository', async () => {
        await enableWrites('test-project-id');

        await handler('Edit', { file_path: '/repos/shared-lib/src/index.ts' }, createTestOptions());

        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('does not let a grant in another project cover this one', async () => {
        await enableWrites('other-project-id');

        await handler('Edit', { file_path: '/repos/my-app/src/index.ts' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
      });

      it('denies the write and does not grant when the user declines', async () => {
        mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'deny', message: 'no' });
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('Edit', { file_path: '/repos/my-app/src/index.ts' }, createTestOptions());

        expect(result.behavior).toBe('deny');
        expect(writeGrants.has('test-project-id')).toBe(false);
      });

      it('gates Bash when the tool input names no path', async () => {
        const options = { ...createTestOptions(), blockedPath: '/repos/my-app/generated.ts' };

        await handler('Bash', { command: 'printf x > "$OUT"' }, options);

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
      });

      it('still allows reads from a connected repo without asking', async () => {
        const read = await handler('Read', { file_path: '/repos/my-app/src/file.ts' }, createTestOptions());
        const grep = await handler('Grep', { path: '/repos/my-app', pattern: 'TODO' }, createTestOptions());

        expect(read.behavior).toBe('allow');
        expect(grep.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('keeps denying credential reads while a grant is active', async () => {
        await enableWrites('test-project-id');

        const result = await handler('Read', { file_path: '~/.ssh/id_rsa' }, createTestOptions());

        expect(result.behavior).toBe('deny');
      });

      it('keeps denying direct Docker config reads while a grant is active', async () => {
        await enableWrites('test-project-id');

        const result = await handler('Read', { file_path: '~/.docker/config.json' }, createTestOptions());

        expect(result.behavior).toBe('deny');
      });

      it('denies recursive searches whose root contains protected paths', async () => {
        const result = await handler('Glob', { path: '/', pattern: '**/*' }, createTestOptions());

        expect(result.behavior).toBe('deny');
      });

      it('keeps denying credential writes while a grant is active', async () => {
        await enableWrites('test-project-id');

        const result = await handler(
          'Write',
          { file_path: '~/.ssh/config', content: 'Host example' },
          createTestOptions(),
        );

        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('covers writes outside the project after consent', async () => {
        await handler('Write', { file_path: '/some/other/path/file.txt', content: 'hello' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(writeGrants.has('test-project-id')).toBe(true);
      });

      it('prompts again after the grant is revoked', async () => {
        await enableWrites('test-project-id');

        await handler('Write', { file_path: '/repos/my-app/a.md', content: 'x' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();

        writeGrants.revoke('test-project-id');
        await handler('Edit', { file_path: '/repos/shared-lib/b.ts' }, createTestOptions());

        expect(mockPromptUser).toHaveBeenCalledTimes(1);
        expect(mockPromptUser.mock.calls[0][2]).toMatchObject({
          chatSessionId: 'chat-1',
          kind: 'write-access',
        });
      });
    });
  });
});
