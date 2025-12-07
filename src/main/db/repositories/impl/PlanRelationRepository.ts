/**
 * Plan Relation Repository Implementation - Dependency Injection Version
 */

import type { PlanRelation } from '../../../../shared/types';
import type { IPlanRelationRepository } from '../../interfaces';

export class PlanRelationRepository implements IPlanRelationRepository {

  getByProject(projectId: string): PlanRelation[] {
  }

  add(relation: Omit<PlanRelation, 'created_at'>): PlanRelation {
  }

  delete(id: string): void {
  }

  remove(id: string): void {
    this.delete(id);
  }

  deleteByItem(itemId: string): void {
  }
}
