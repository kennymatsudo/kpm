import type { SliceCreator, ProjectSlice } from './types';
import { createBaseState } from './baseState';

  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({
  })),
  removeProject: (projectId) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== projectId),
    currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
  })),
  setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
  reset: () => set(createBaseState()),
});
