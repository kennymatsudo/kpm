import type {
  Attachment,
  PlanItem,
  Project,
  Repo,
  Worktree,
} from '../../shared/types';
import { listProjectPlanItems } from './planService';
import { listProjectRepos } from './repoService';

export interface LoadedProjectResources {
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  worktrees: Worktree[];
}

export async function loadProjectResources(projectId: string): Promise<LoadedProjectResources> {
  const [repos, attachments, planItems, worktrees] = await Promise.all([
    listProjectRepos(projectId),
    window.api.attachments.list({ projectId }),
    listProjectPlanItems(projectId),
    window.api.worktrees.getByProject({ projectId }),
  ]);

  return {
    repos,
    attachments,
    planItems,
    worktrees,
  };
}

export function loadProjectRepoBranches(repoPaths: string[]): Promise<Record<string, string | null>> {
  return window.api.repos.getBranches({ paths: repoPaths });
}

/** Returns the path that should be watched/queried for branch info (worktree if set, else main). */
export function getEffectiveRepoPath(repo: Repo): string {
  return repo.active_worktree_path ?? repo.path;
}

export function watchProjectRepos(repos: Repo[]): string[] {
  for (const repo of repos) {
    void window.api.repos.watch({ repoId: repo.id, path: getEffectiveRepoPath(repo) });
  }

  return repos.map(getEffectiveRepoPath);
}

export async function unwatchProjectRepos(repoPaths: string[]): Promise<void> {
  if (repoPaths.length === 0) {
    return;
  }

  await Promise.all(repoPaths.map((path) => window.api.repos.unwatch({ path })));
}

export async function disconnectActiveChatSessions(projectId: string): Promise<void> {
  const result = await window.api.chat.getActiveSessions(projectId);
  if (!result.success || !result.sessions) {
    return;
  }

  await Promise.all(
    result.sessions.map((session: { chatSessionId: string }) =>
      window.api.chat.disconnectSpecificSession({ projectId, chatSessionId: session.chatSessionId })
    )
  );
}

export async function persistLastOpenedProjectId(projectId: string): Promise<void> {
  await window.api.settings.app.set({ key: 'lastOpenedProjectId', value: projectId });
}

export async function getLastOpenedProjectId(): Promise<string | undefined> {
  const result = await window.api.settings.app.get({ key: 'lastOpenedProjectId' });
  return result.success ? result.value ?? undefined : undefined;
}

export function createProjectRecord(input: {
  name: string;
  folderPath?: string;
}): Promise<Project> {
  return window.api.projects.create(input);
}

export function getDefaultProjectLocation(): Promise<string> {
  return window.api.projects.getDefaultLocation();
}

export function selectProjectParentFolder(title?: string): Promise<string | null> {
  return window.api.fileExplorer.selectFolderDialog({ title });
}

export async function deleteProjectRecord(projectId: string): Promise<void> {
  await window.api.projects.delete({ projectId });
}

export function listProjects(): Promise<Project[]> {
  return window.api.projects.list();
}

export function subscribeToProjectMenuEvents(handlers: {
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void | Promise<void>;
}): () => void {
  const unsubNewProject = window.api.menu.onNewProject(() => {
    handlers.onNewProject?.();
  });

  const unsubOpenProject = window.api.menu.onOpenProject(({ projectId }: { projectId: string }) => {
    void handlers.onOpenProject?.(projectId);
  });

  return () => {
    unsubNewProject();
    unsubOpenProject();
  };
}

export function subscribeToRepoBranchChanges(
  callback: (event: { repoId: string; repoPath: string; branch: string | null }) => void
): () => void {
  return window.api.repos.onBranchChanged(callback);
}
