/**
 * Repo Repository Implementation - Dependency Injection Version
 */

import type { IRepoRepository } from '../../interfaces';

export class RepoRepository implements IRepoRepository {

  getByProject(projectId: string): Repo[] {
  }

  add(projectId: string, path: string): Repo {
  }

  }

  delete(id: string): void {
  }

  remove(id: string): void {
    this.delete(id);
  }
}
