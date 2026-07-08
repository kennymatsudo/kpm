import type {
  Attachment,
  PlanItem,
  Repo,
} from '../../../shared/types';
import { useProjectStore } from '../projectStore';

export interface LoadedProjectData {
  projectId: string;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
}

/**
 * Applies a fully loaded project payload as a single cross-domain operation.
 * This keeps project loading orchestration outside components/hooks.
 */
export function applyLoadedProjectData(data: LoadedProjectData): void {
  const state = useProjectStore.getState();

  state.setCurrentProject(data.projectId);
  state.setRepos(data.repos);
  state.setAttachments(data.attachments);
  state.updatePlanItems(data.planItems);
  state.setRepoBranches({});
}

export function setProjectSwitching(switching: boolean): void {
  useProjectStore.getState().setSwitchingProject(switching);
}
