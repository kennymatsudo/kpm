/**
 * Project Domain Repository Interfaces
 *
 * Interfaces for project-level data: projects, linked repos, attachments.
 */

import type {
  Project,
  Repo,
  Attachment,
  RepoEnvironmentMode,
} from '../../../shared/types';

// =============================================================================
// Project Repository
// =============================================================================

export interface IProjectRepository {
  get(id: string): Project | undefined;
  list(): Project[];
  update(id: string, updates: Partial<Pick<Project, 'name' | 'phase'>>): void;
  updateTokens(projectId: string, tokens: { total: number; input: number; output: number }): void;
  resetTokens(projectId: string): void;
  updateStorybookUrl(projectId: string, url: string | null): void;
  delete(id: string): void;
}

// =============================================================================
// Repo Repository (linked code repositories)
// =============================================================================

export interface IRepoRepository {
  getByProject(projectId: string): Repo[];
  getById(id: string): Repo | undefined;
  add(projectId: string, path: string): Repo;
  updateEnvironmentMode(id: string, mode: RepoEnvironmentMode): void;
  delete(id: string): void;
  remove(id: string): void;
}

// =============================================================================
// Attachment Repository
// =============================================================================

export interface IAttachmentRepository {
  getByProject(projectId: string): Attachment[];
  add(projectId: string, sourcePath: string, filename: string): Attachment;
  get(id: string): Attachment | undefined;
  delete(id: string): void;
  remove(id: string): void;
}
