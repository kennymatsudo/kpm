import type { Repo } from '../../shared/types';

export function listProjectRepos(projectId: string): Promise<Repo[]> {
  return window.api.repos.list(projectId);
}

export function selectRepoPaths(): Promise<string[]> {
  return window.api.repos.selectDialog();
}

export async function loadRepoBranchOptions(repoPath: string): Promise<{
  branches: string[];
  currentBranch: string | null;
}> {
  const [branches, currentBranch] = await Promise.all([
    window.api.repos.listAllBranches(repoPath),
    window.api.repos.getBranch(repoPath),
  ]);

  return {
    branches,
    currentBranch,
  };
}

export function listRepoDirectories(repoPath: string, prefix: string): Promise<string[]> {
  return window.api.repos.listDirectories(repoPath, prefix);
}
