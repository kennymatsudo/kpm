import type {
  Attachment,
  FolderInspection,
  PlanItem,
  Project,
  Repo,
} from '../../shared/types';
import { listProjectPlanItems } from './planService';
import { listProjectRepos } from './repoService';
import { getOptionalSetting, setSetting } from './settingsService';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';

export interface LoadedProjectResources {
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
}

export async function loadProjectResources(projectId: string): Promise<LoadedProjectResources> {
  const [repos, attachments, planItems] = await Promise.all([
    listProjectRepos(projectId),
    window.api.attachments.list({ projectId }),
    listProjectPlanItems(projectId),
  ]);

  return {
    repos,
    attachments,
    planItems,
  };
}

export function loadProjectRepoBranches(repoPaths: string[]): Promise<Record<string, string | null>> {
  return window.api.repos.getBranches({ paths: repoPaths });
}

export function watchProjectRepos(repos: Repo[]): string[] {
  for (const repo of repos) {
    void window.api.repos.watch({ repoId: repo.id, path: resolveEffectiveRepoPath(repo) });
  }

  return repos.map(resolveEffectiveRepoPath);
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
  await setSetting('lastOpenedProjectId', projectId);
}

export async function getLastOpenedProjectId(): Promise<string | undefined> {
  return getOptionalSetting('lastOpenedProjectId');
}

export function createProjectRecord(input: {
  name: string;
  folderPath?: string;
}): Promise<Project> {
  return window.api.projects.create(input);
}

/**
 * Picks the folder a project's notes and context live in. The folder is
 * adopted as-is, not created inside a parent the user chooses.
 */
export function selectProjectWorkspaceFolder(title?: string): Promise<string | null> {
  return window.api.fileExplorer.selectFolderDialog({ title });
}

export function inspectProjectFolder(folderPath: string): Promise<FolderInspection> {
  return window.api.projects.inspectFolder({ folderPath });
}

/** Where a project lands when the user doesn't pick a folder. */
export function getManagedProjectsRoot(): Promise<string> {
  return window.api.projects.getDefaultLocation();
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
