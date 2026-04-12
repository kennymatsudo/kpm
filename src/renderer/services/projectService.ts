import type { Project } from '../../shared/types';

export function listProjects(): Promise<Project[]> {
  return window.api.projects.list();
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const projects = await listProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function getProjectAbsolutePath(
  projectId: string,
  relativePath?: string
): Promise<string | null> {
  const project = await getProjectById(projectId);
  if (!project) {
    return null;
  }

  if (!relativePath) {
    return project.folder_path;
  }

  return `${project.folder_path}/${relativePath}`;
}

export async function openProjectFolder(projectId: string): Promise<void> {
  await window.api.projects.openFolder(projectId);
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'phase'>>
): Promise<void> {
  await window.api.projects.update(projectId, updates);
}
