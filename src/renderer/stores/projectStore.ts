import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { emit } from './storeEvents';
import { createBaseState } from './project/baseState';
import { createProjectSlice } from './project/projectSlice';
import { createResourceSlice } from './project/resourceSlice';
import { createUiSlice } from './project/uiSlice';
import { createPlanSlice } from './project/planSlice';

// Re-export types for component consumers
export type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanRelation,
  ProjectState,
  ProjectStoreDependencies,
};

export const createProjectStore = (
  deps?: ProjectStoreDependencies
): UseBoundStore<StoreApi<ProjectState>> => {
  const resolvedDeps: ProjectStoreDependencies = deps ?? {
    api: (globalThis as { window?: { api: ProjectStoreDependencies['api'] } }).window?.api ?? ({} as ProjectStoreDependencies['api']),
    emit,
  };

  return create<ProjectState>((set, get, store) => ({
    ...createBaseState(),
    ...createProjectSlice(resolvedDeps)(set, get, store),
    ...createPlanSlice(resolvedDeps)(set, get, store),
    ...createResourceSlice(resolvedDeps)(set, get, store),
    ...createUiSlice(resolvedDeps)(set, get, store),
  }));
};

export const useProjectStore = createProjectStore();
