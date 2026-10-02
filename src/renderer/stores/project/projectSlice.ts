import type { SliceCreator, ProjectSlice } from './types';
import { createBaseState } from './baseState';

export const createProjectSlice: SliceCreator<ProjectSlice> = (_deps) => (set, get) => ({
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({
    projects: [...state.projects, project],
  })),
  removeProject: (projectId) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== projectId),
    currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
  })),
  setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
  refreshProjects: async () => {
    const projects = await _deps.api.projects.list();
    set({ projects });
    return projects;
  },
  reset: () => set(createBaseState()),
  resetProjectState: () => {
    // Clear project-specific state while preserving the project list.
    // This is called when switching projects to prevent state bleeding.
    const { projects, currentProjectId } = get();
    set({
      ...createBaseState(),
      projects,
      currentProjectId,
    });
  },
});
