import { describe, it, expect, vi } from 'vitest';
import { createRepoService, type RepoServiceDeps } from '../../src/main/services/repo/RepoService';
import type { Repo } from '../../src/shared/types';

function createRepo(id: string, projectId: string, path: string): Repo {
  return {
    id,
    project_id: projectId,
    path,
    created_at: '',
  };
}

function createMocks(overrides?: Partial<RepoServiceDeps>): RepoServiceDeps {
  const repoStore = new Map<string, Repo>();

  const repos = {
    getByProject: vi.fn((projectId: string) =>
      Array.from(repoStore.values()).filter(r => r.project_id === projectId)
    ),
    getById: vi.fn((id: string) => repoStore.get(id)),
    add: vi.fn((projectId: string, path: string) => {
      const repo: Repo = {
        id: 'new-repo',
        project_id: projectId,
        path,
        created_at: new Date().toISOString(),
      };
      repoStore.set(repo.id, repo);
      return repo;
    }),
    updateEnvironmentMode: vi.fn(),
    updateSetupCommand: vi.fn(),
    updateActiveWorktreePath: vi.fn(),
    delete: vi.fn((id: string) => repoStore.delete(id)),
    remove: vi.fn((id: string) => repoStore.delete(id)),
  };

  const watcher = {
    init: vi.fn(),
    watchRepo: vi.fn(),
    unwatchRepo: vi.fn(),
    unwatchAll: vi.fn(),
    getBranch: vi.fn(() => 'main'),
    getBranches: vi.fn((paths: string[]) => {
      const result: Record<string, string | null> = {};
      for (const p of paths) {
        result[p] = 'main';
      }
      return result;
    }),
    getBranchesAsync: vi.fn(async (paths: string[]) => {
      const result: Record<string, string | null> = {};
      for (const p of paths) {
        result[p] = 'main';
      }
      return result;
    }),
    getCachedBranch: vi.fn(() => 'main'),
  };

  const fs = {
    readdirSync: vi.fn(() => []),
  };

  const path = {
    join: vi.fn((...parts: string[]) => parts.join('/')),
    relative: vi.fn((from: string, to: string) => to.slice(`${from}/`.length)),
    dirname: vi.fn((p: string) => p.slice(0, p.lastIndexOf('/'))),
    basename: vi.fn((p: string) => p.slice(p.lastIndexOf('/') + 1)),
  };

  const gitExec = vi.fn(async () => ({ stdout: '', stderr: '' }));

  return { repos, watcher, fs, path, gitExec, ...overrides };
}

describe('RepoService', () => {
  describe('add', () => {
    it('adds repo to database and starts watching', () => {
      const deps = createMocks();
      const service = createRepoService(deps);

      const result = service.add('p1', '/path/to/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.path).toBe('/path/to/repo');
        expect(result.data.project_id).toBe('p1');
      }
      expect(deps.repos.add).toHaveBeenCalledWith('p1', '/path/to/repo');
      expect(deps.watcher.watchRepo).toHaveBeenCalledWith('new-repo', '/path/to/repo');
    });

    it('returns failure when add throws', () => {
      const deps = createMocks();
      (deps.repos.add as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Database error');
      });
      const service = createRepoService(deps);

      const result = service.add('p1', '/path/to/repo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Database error');
      }
    });
  });

  describe('remove', () => {
    it('stops watching and removes repo from database', () => {
      const repo = createRepo('r1', 'p1', '/path/to/repo');
      const deps = createMocks();
      (deps.repos.getById as ReturnType<typeof vi.fn>).mockReturnValue(repo);

      const service = createRepoService(deps);

      const result = service.remove('r1');

      expect(result.ok).toBe(true);
      expect(deps.watcher.unwatchRepo).toHaveBeenCalledWith('/path/to/repo');
      expect(deps.repos.remove).toHaveBeenCalledWith('r1');
    });

    it('removes from database even if repo not found (already removed)', () => {
      const deps = createMocks();
      (deps.repos.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const service = createRepoService(deps);

      const result = service.remove('nonexistent');

      expect(result.ok).toBe(true);
      expect(deps.watcher.unwatchRepo).not.toHaveBeenCalled();
      expect(deps.repos.remove).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('list', () => {
    it('returns repos for project', () => {
      const repos = [
        createRepo('r1', 'p1', '/path/to/repo1'),
        createRepo('r2', 'p1', '/path/to/repo2'),
      ];
      const deps = createMocks();
      (deps.repos.getByProject as ReturnType<typeof vi.fn>).mockReturnValue(repos);

      const service = createRepoService(deps);

      const result = service.list('p1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
      }
    });
  });

  describe('getBranch', () => {
    it('returns current branch for repo path', () => {
      const deps = createMocks();
      (deps.watcher.getBranch as ReturnType<typeof vi.fn>).mockReturnValue('feature-branch');

      const service = createRepoService(deps);

      const result = service.getBranch('/path/to/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('feature-branch');
      }
    });

    it('returns null when not a git repo', () => {
      const deps = createMocks();
      (deps.watcher.getBranch as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const service = createRepoService(deps);

      const result = service.getBranch('/not/a/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('getBranches', () => {
    it('returns branches for multiple paths', () => {
      const deps = createMocks();
      (deps.watcher.getBranches as ReturnType<typeof vi.fn>).mockReturnValue({
        '/path/to/repo1': 'main',
        '/path/to/repo2': 'develop',
      });

      const service = createRepoService(deps);

      const result = service.getBranches(['/path/to/repo1', '/path/to/repo2']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data['/path/to/repo1']).toBe('main');
        expect(result.data['/path/to/repo2']).toBe('develop');
      }
    });
  });

  describe('watch/unwatch', () => {
    it('watch starts watching a repo', () => {
      const deps = createMocks();
      const service = createRepoService(deps);

      const result = service.watch('r1', '/path/to/repo');

      expect(result.ok).toBe(true);
      expect(deps.watcher.watchRepo).toHaveBeenCalledWith('r1', '/path/to/repo');
    });

    it('unwatch stops watching a repo', () => {
      const deps = createMocks();
      const service = createRepoService(deps);

      const result = service.unwatch('/path/to/repo');

      expect(result.ok).toBe(true);
      expect(deps.watcher.unwatchRepo).toHaveBeenCalledWith('/path/to/repo');
    });
  });

  describe('updateEnvironmentMode', () => {
    it('updates repo environment mode through the repository', () => {
      const deps = createMocks();
      const service = createRepoService(deps);

      const result = service.updateEnvironmentMode('r1', 'nix');

      expect(result.ok).toBe(true);
      expect(deps.repos.updateEnvironmentMode).toHaveBeenCalledWith('r1', 'nix');
    });
  });

  describe('listDirectories', () => {
    it('returns matching relative directories', () => {
      const deps = createMocks();
      (deps.fs.readdirSync as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce([
          { name: 'src', isDirectory: () => true },
          { name: '.git', isDirectory: () => true },
        ])
        .mockReturnValueOnce([
          { name: 'components', isDirectory: () => true },
        ]);

      const service = createRepoService(deps);

      const result = service.listDirectories('/repo', 'src', 2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(['src/', 'src/components/']);
      }
    });
  });

  describe('listAllBranches', () => {
    it('returns local branches from git', async () => {
      const deps = createMocks();
      (deps.gitExec as ReturnType<typeof vi.fn>).mockResolvedValue({
        stdout: 'feature/test\nmain\n',
        stderr: '',
      });
      const service = createRepoService(deps);

      const result = await service.listAllBranches('/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(['feature/test', 'main']);
      }
    });
  });
});
