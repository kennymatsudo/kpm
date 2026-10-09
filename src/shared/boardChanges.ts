/**
 * Board changes chat can propose: linking a task to work that started outside
 * KPM. Each one is fully resolved before it is proposed, so the approval panel
 * shows exactly what will happen, and applying it goes through the same service
 * call as the matching board menu item.
 */

/** One of a repository's worktrees, as the Attach worktree flow sees it. */
export interface WorktreeCandidate {
  path: string;
  branch: string | null;
  /** Why it cannot be attached; absent when it can. */
  unavailableReason?: string;
  /** The task whose board session already owns this worktree. */
  attachedTo?: { planItemId: string | null; title: string | null; sameProject: boolean };
}

export interface AttachWorktreeChange {
  kind: 'attach_worktree';
  planItemId: string;
  itemTitle: string;
  repoId: string;
  repoPath: string;
  worktreePath: string;
  branchName: string;
  /** A PR already linked to the task that moves onto the attached session. */
  carriedPrNumber: number | null;
}

export interface LinkPrChange {
  kind: 'link_pr';
  planItemId: string;
  itemTitle: string;
  repoId: string;
  repoPath: string;
  prNumber: number;
  prUrl: string;
  prTitle: string | null;
  prHeadBranch: string | null;
  /** The branch of the task's worktree session the PR joins, if it has one. */
  sessionBranch: string | null;
  /** The PR this one replaces on the task's session. */
  replacesPrNumber: number | null;
}

export type BoardChange = AttachWorktreeChange | LinkPrChange;
