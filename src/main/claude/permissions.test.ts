/**
 * Permissions Unit Tests
 *
 * Tests the permission control logic for Claude SDK tool usage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPermissionHandler,
  extractPath,
  isWithinDirectory,
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
function createTestOptions(): { signal: AbortSignal; toolUseID: string } {
  return {
    signal: new AbortController().signal,
    toolUseID: 'test-tool-use-id',
  };
}

describe('permissions', () => {
  describe('extractPath', () => {
    });

    });
  });

  describe('isWithinDirectory', () => {
    });

    });
  });

    });

    });
  });

  describe('createPermissionHandler', () => {
    let context: PermissionContext;
    let mockPromptUser: PromptUserFn;
    let handler: ReturnType<typeof createPermissionHandler>;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
      vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(false);

      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
      };

      mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      handler = createPermissionHandler(context, mockPromptUser);
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

        const result = await handler('Read', { file_path: '/outside/project/file.ts' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Read', { file_path: '../outside/file.ts' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Grep', { path: '/outside/project', pattern: 'foo' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Glob', { path: '/outside/project', pattern: '*.ts' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('allows Grep without an explicit path (resolves from cwd)', async () => {
        const result = await handler('Grep', { pattern: 'foo' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('auto-allows MCP tools', async () => {
        const result = await handler('mcp__kpm__get_plan_hierarchy', { projectId: 'test' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          disabledMcpServerNames: ['claude.ai Slack'],
        };
        handler = createPermissionHandler(context, mockPromptUser);


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
        handler = createPermissionHandler(context, mockPromptUser);

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
        handler = createPermissionHandler(context, mockPromptUser);

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
        handler = createPermissionHandler(context, mockPromptUser);

        const result = await handler('Edit', { file_path: '/outside/project/file.ts' }, createTestOptions());

        expect(result.behavior).toBe('deny');
      });
    });

        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(true);
        vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(true);

        const result = await handler('Bash', { command: 'git log --oneline' }, createTestOptions());
      });
    });

    describe('unknown tools', () => {
      it('auto-allows unknown tools by default', async () => {
        const result = await handler('SomeNewTool', { data: 'whatever' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });
    });

    describe('project file write interception', () => {

          const result = await handler(
            'Write',
            { file_path: `/test/project/${filename}`, content: '# Updated context' },
            createTestOptions()
          );

          expect(result.behavior).toBe('deny');
          expect(mockOnClaudeMdEdit).toHaveBeenCalledWith('test-project-id', '# Updated context');
        }

          const result = await handler(
            'Edit',
            { file_path: `/test/project/${filename}`, old_string: 'a', new_string: 'b' },
            createTestOptions()
          );

          expect(result).toMatchObject({
            behavior: 'deny',
          });
        }

      it('intercepts Write to project directory when callback provided', async () => {
        const mockOnProjectFileWrite = vi.fn();
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          onProjectFileWrite: mockOnProjectFileWrite,
        };
        handler = createPermissionHandler(context, mockPromptUser);

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
    });

      beforeEach(() => {
        context = {
          projectPath: '/test/project',
          projectId: 'test-project-id',
          repoPaths: ['/repos/my-app', '/repos/shared-lib'],
        };
        handler = createPermissionHandler(context, mockPromptUser);
        vi.mocked(clientManager.hasPermissionCached).mockReturnValue(false);
        vi.mocked(clientManager.hasAllowAllRemaining).mockReturnValue(false);
      });

      });

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
