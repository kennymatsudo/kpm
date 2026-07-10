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
  commandInvokesGit,
  type PermissionContext,
  type PromptUserFn,
} from './permissions';
import { clientManager } from './clientManager';

// Mock clientManager
vi.mock('./clientManager', () => ({
  clientManager: {
    hasPermissionCached: vi.fn(),
    hasAllowAllRemaining: vi.fn(),
    cachePermission: vi.fn(),
    clearPermissionCache: vi.fn(),
  },
}));

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
function buildHandler(context: PermissionContext, promptUser: PromptUserFn) {
  const inner = createPermissionHandler(context, promptUser);
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

  describe('commandInvokesGit', () => {
    // Raw git is blocked wholesale in chat Bash (use the git_read tool instead);
    // the read-only classification now lives in gitReadOnly.ts.
    it('detects git invocations across common shell forms', () => {
      for (const command of [
        'git status',
        'git log --oneline',
        'git commit -m "fix"',
        'git push origin main',
        'git -C /repos/my-app status --short',
        '/usr/bin/git diff',
        'echo hello; git commit -m "fix"',
        'cat foo | git apply',
        '(git log)',
      ]) {
        expect(commandInvokesGit(command)).toBe(true);
      }
    });

    it('ignores commands that merely contain git as text', () => {
      for (const command of [
        'ls -la',
        'npm install',
        'echo "git is great"',
        'rg gitignore',
        'cat .gitignore',
      ]) {
        expect(commandInvokesGit(command)).toBe(false);
      }
    });
  });

  describe('createPermissionHandler', () => {
    let context: PermissionContext;
    let mockPromptUser: PromptUserFn;
    let handler: ReturnType<typeof buildHandler>;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
      vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(false);

      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
      };

      mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      handler = buildHandler(context, mockPromptUser);
    });

    describe('auto-allow rules', () => {
      it('auto-allows Edit in project directory', async () => {
        const result = await handler('Edit', { file_path: '/test/project/src/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
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
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);

        await handler(
          'Bash',
          { command: 'cat ./README.md; cat ~/.ssh/id_rsa' },
          createTestOptions()
        );

        expect(mockPromptUser).toHaveBeenCalled();
      });
    });

    describe('permission cache', () => {
      it('allows cached permission without prompting', async () => {
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(true);

        const result = await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
        expect(clientManager.hasPermissionCached).toHaveBeenCalledWith('test-project-id', 'Edit:/outside/project/file.ts');
      });

      it('caches "Allow Always" decisions', async () => {
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
        mockPromptUser = vi.fn().mockResolvedValue({
          behavior: 'allow',
          updatedInput: {},
          allowAlways: true,
        });
        handler = buildHandler(context, mockPromptUser);

        await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());

        expect(clientManager.cachePermission).toHaveBeenCalledWith('test-project-id', 'Edit:/outside/project/file.ts');
      });

      it('does not cache single-time allows', async () => {
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
        mockPromptUser = vi.fn().mockResolvedValue({
          behavior: 'allow',
          updatedInput: {},
          // No allowAlways flag
        });
        handler = buildHandler(context, mockPromptUser);

        await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());

        expect(clientManager.cachePermission).not.toHaveBeenCalled();
      });
    });

    describe('write tools outside project', () => {
      beforeEach(() => {
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
      });

      it('prompts for Edit outside project', async () => {
        await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
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

    describe('git in Bash (blocked — use git_read)', () => {
      it('denies any git in Bash without prompting', async () => {
        for (const command of [
          'git commit -m "fix"',
          'git push origin main',
          'git log --oneline',
          'git status',
          'git diff HEAD',
          'git -C /repos/my-app status --short',
          'git log | sort -o /tmp/out.txt',
        ]) {
          const result = await handler('Bash', { command }, createTestOptions());
          expect(result.behavior).toBe('deny');
        }
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies git even with cached / allow-all permissions', async () => {
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(true);
        vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(true);

        const result = await handler('Bash', { command: 'git log --oneline' }, createTestOptions());
        expect(result.behavior).toBe('deny');
      });

      it('points the agent at the git_read tool', async () => {
        const result = await handler('Bash', { command: 'git status' }, createTestOptions());
        expect(result.behavior).toBe('deny');
        if (result.behavior === 'deny') {
          expect(result.message).toContain('git_read');
        }
      });

      it('still allows non-git Bash to follow normal rules (prompts)', async () => {
        await handler('Bash', { command: 'ls -la' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
      });
    });

    describe('unknown tools', () => {
      it('prompts for unknown tools instead of silently allowing', async () => {
        const result = await handler('SomeNewTool', { data: 'whatever' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
        expect(result.behavior).toBe('allow'); // mockPromptUser resolves to allow
      });

      it('returns a deny decision for an unknown tool the user rejects', async () => {
        mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'deny', updatedInput: {} });
        handler = buildHandler(context, mockPromptUser);

        const result = await handler('SomeNewTool', { data: 'whatever' }, createTestOptions());
        expect(result.behavior).toBe('deny');
      });

      it('auto-allows unknown tools when autoApprove is set', async () => {
        context = { projectPath: '/test/project', projectId: 'test-project-id', autoApprove: true };
        handler = buildHandler(context, mockPromptUser);

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

    describe('NotebookEdit (write tool)', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          repoPaths: ['/repos/my-app'],
        };
        handler = buildHandler(context, mockPromptUser);
      });

      it('denies NotebookEdit into a connected repo', async () => {
        const result = await handler(
          'NotebookEdit',
          { notebook_path: '/repos/my-app/analysis.ipynb', new_source: 'x' },
          createTestOptions()
        );
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
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

      it('allows Write to project directory when no callback provided', async () => {
        // No onProjectFileWrite callback
        const result = await handler('Write', { file_path: '/test/project/docs/guide.md', content: 'Hello world' }, createTestOptions());

        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
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

    describe('connected repos (read-only)', () => {
      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          repoPaths: ['/repos/my-app', '/repos/shared-lib'],
        };
        handler = buildHandler(context, mockPromptUser);
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
        vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(false);
      });

      it('denies Write to connected repo', async () => {
        const result = await handler('Write', { file_path: '/repos/my-app/docs/file.md', content: 'hello' }, createTestOptions());
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('denies Edit to connected repo', async () => {
        const result = await handler('Edit', { file_path: '/repos/shared-lib/src/index.ts' }, createTestOptions());
        expect(result.behavior).toBe('deny');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Read from connected repo', async () => {
        const result = await handler('Read', { file_path: '/repos/my-app/src/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Grep in connected repo', async () => {
        const result = await handler('Grep', { path: '/repos/my-app', pattern: 'TODO' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('still prompts for writes outside project AND repos', async () => {
        await handler('Write', { file_path: '/some/other/path/file.txt', content: 'hello' }, createTestOptions());
        expect(mockPromptUser).toHaveBeenCalled();
      });
    });
  });
});
