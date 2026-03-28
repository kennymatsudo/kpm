import type { Repo } from '../../shared/types';

  return window.api.repos.list(projectId);
}

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

  return window.api.repos.listDirectories(repoPath, prefix);
}
