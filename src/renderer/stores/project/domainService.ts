import type {
  Attachment,
  PlanItem,
  Repo,
  Worktree,
} from '../../../shared/types';

export interface LoadedProjectData {
  projectId: string;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  worktrees: Worktree[];
}

/**
 * Applies a fully loaded project payload as a single cross-domain operation.
 * This keeps project loading orchestration outside components/hooks.
 */
export function applyLoadedProjectData(data: LoadedProjectData): void {

}

export function setProjectSwitching(switching: boolean): void {
}
