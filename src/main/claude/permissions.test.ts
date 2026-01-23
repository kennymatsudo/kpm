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

  describe('createPermissionHandler', () => {
    let context: PermissionContext;
    let mockPromptUser: PromptUserFn;
    let handler: ReturnType<typeof createPermissionHandler>;

    beforeEach(() => {
      vi.clearAllMocks();

      context = {
        projectPath: '/test/project',
        projectId: 'test-project-id',
      };

      mockPromptUser = vi.fn().mockResolvedValue({ behavior: 'allow', updatedInput: {} });
      handler = createPermissionHandler(context, mockPromptUser);
    });

    describe('auto-allow rules', () => {
        const result = await handler('Edit', { file_path: '/test/project/src/file.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Read', { file_path: '/outside/project/file.ts' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Grep', { path: '/outside/project', pattern: 'foo' }, createTestOptions());
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

        const result = await handler('Glob', { path: '/outside/project', pattern: '*.ts' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });

      it('auto-allows MCP tools', async () => {
        const result = await handler('mcp__kpm__get_plan_hierarchy', { projectId: 'test' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
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

    describe('unknown tools', () => {
      it('auto-allows unknown tools by default', async () => {
        const result = await handler('SomeNewTool', { data: 'whatever' }, createTestOptions());
        expect(result.behavior).toBe('allow');
        expect(mockPromptUser).not.toHaveBeenCalled();
      });
    });
  });
});
