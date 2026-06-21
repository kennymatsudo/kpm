/**
 * DevSession Repository Implementation - Dependency Injection Version
 *
 * Manages development sessions for plan item implementation.
 * Each session runs Claude Code in an isolated git worktree.
 *
 * Optimized with prepared statement caching and RETURNING clause.
 */

import type { Database, Statement } from 'better-sqlite3';
import type {
  AgentExecutionMode,
  AgentReviewPolicy,
  DevSessionAutomationPhase,
  DevSession,
  DevSessionStatus,
  DevSessionWithPlanItem,
} from '../../../../shared/types';
import type { IDevSessionRepository } from '../../interfaces';

/**
 * Prepared statements cache for hot paths.
 */
interface PreparedStatements {
  // Read operations
  getById: Statement;
  getByProject: Statement;
  getByProjectWithPlanItems: Statement;
  getActiveSessions: Statement;
  getByPlanItem: Statement;
  getActiveByPlanItem: Statement;

  // Write operations
  insert: Statement;
  updateStatus: Statement;
  updateAutomationPhase: Statement;
  updateWorkflowControls: Statement;
  updatePrInfo: Statement;
  updateName: Statement;
  updateBaseSha: Statement;
  updateMergeOrder: Statement;
  delete: Statement;
  markActiveAsInactive: Statement;
}

export class DevSessionRepository implements IDevSessionRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      // Read operations
      getById: db.prepare('SELECT * FROM dev_sessions WHERE id = ?'),
      getByProject: db.prepare('SELECT * FROM dev_sessions WHERE project_id = ? ORDER BY created_at DESC'),
      getByProjectWithPlanItems: db.prepare(`
        SELECT
          ds.*,
          pi.id as pi_id,
          pi.title as pi_title,
          pi.description as pi_description,
          pi.label as pi_label,
          pi.external_key as pi_external_key,
          r.path as repo_path
        FROM dev_sessions ds
        LEFT JOIN plan_items pi ON ds.plan_item_id = pi.id
        LEFT JOIN repos r ON ds.repo_id = r.id
        WHERE ds.project_id = ?
        ORDER BY ds.created_at DESC
      `),
      getActiveSessions: db.prepare(`
        SELECT * FROM dev_sessions
        WHERE project_id = ? AND status IN ('pending', 'active')
        ORDER BY created_at DESC
      `),
      getByPlanItem: db.prepare('SELECT * FROM dev_sessions WHERE plan_item_id = ? ORDER BY created_at DESC LIMIT 1'),
      getActiveByPlanItem: db.prepare(`
        SELECT * FROM dev_sessions
        WHERE plan_item_id = ? AND status IN ('pending', 'active')
        ORDER BY created_at DESC
        LIMIT 1
      `),

      // Write operations - use RETURNING to avoid re-query
      insert: db.prepare(`
        INSERT INTO dev_sessions (
          id, project_id, plan_item_id, repo_id, name,
          worktree_path, branch_name, base_branch,
          status, agent_type, execution_mode, review_policy, automation_phase, initial_instructions
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      updateStatus: db.prepare('UPDATE dev_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      updateAutomationPhase: db.prepare(`
        UPDATE dev_sessions
        SET automation_phase = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateWorkflowControls: db.prepare(`
        UPDATE dev_sessions
        SET execution_mode = ?, review_policy = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updatePrInfo: db.prepare(`
        UPDATE dev_sessions
        SET pr_number = ?, pr_url = ?, pr_state = ?, review_state = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateName: db.prepare('UPDATE dev_sessions SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      updateBaseSha: db.prepare('UPDATE dev_sessions SET base_sha = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      updateMergeOrder: db.prepare('UPDATE dev_sessions SET merge_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      delete: db.prepare('DELETE FROM dev_sessions WHERE id = ?'),
      markActiveAsInactive: db.prepare(`
        UPDATE dev_sessions
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active'
      `),
    };
  }

  get(id: string): DevSession | undefined {
    return this.stmts.getById.get(id) as DevSession | undefined;
  }

  getByProject(projectId: string): DevSession[] {
    return this.stmts.getByProject.all(projectId) as DevSession[];
  }

  getByProjectWithPlanItems(projectId: string): DevSessionWithPlanItem[] {
    const rows = this.stmts.getByProjectWithPlanItems.all(projectId) as (DevSession & {
      pi_id: string | null;
      pi_title: string | null;
      pi_description: string | null;
      pi_label: string | null;
      pi_external_key: string | null;
      repo_path: string | null;
    })[];

    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      plan_item_id: row.plan_item_id,
      repo_id: row.repo_id,
      name: row.name,
      worktree_path: row.worktree_path,
      branch_name: row.branch_name,
      base_branch: row.base_branch,
      base_sha: row.base_sha ?? null,
      status: row.status,
      agent_type: row.agent_type,
      execution_mode: row.execution_mode ?? 'standard',
      review_policy: row.review_policy ?? 'auto',
      automation_phase: row.automation_phase ?? null,
      initial_instructions: row.initial_instructions,
      pr_number: row.pr_number ?? null,
      pr_url: row.pr_url ?? null,
      pr_state: row.pr_state ?? null,
      review_state: row.review_state ?? null,
      merge_order: row.merge_order ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      repo_name: row.repo_path ? row.repo_path.split('/').pop()! : null,
      plan_item: row.pi_id ? {
        id: row.pi_id,
        title: row.pi_title!,
        description: row.pi_description,
        label: row.pi_label,
        external_key: row.pi_external_key,
      } : null,
    }));
  }

  getActiveSessions(projectId: string): DevSession[] {
    return this.stmts.getActiveSessions.all(projectId) as DevSession[];
  }

  getByPlanItem(planItemId: string): DevSession | undefined {
    return this.stmts.getByPlanItem.get(planItemId) as DevSession | undefined;
  }

  getActiveByPlanItem(planItemId: string): DevSession | undefined {
    return this.stmts.getActiveByPlanItem.get(planItemId) as DevSession | undefined;
  }

  create(session: Omit<DevSession, 'created_at' | 'updated_at' | 'completed_at'>): DevSession {
    // Use RETURNING to get inserted row in one query
    return this.stmts.insert.get(
      session.id,
      session.project_id,
      session.plan_item_id,
      session.repo_id,
      session.name,
      session.worktree_path,
      session.branch_name,
      session.base_branch,
      session.status,
      session.agent_type,
      session.execution_mode,
      session.review_policy,
      session.automation_phase ?? null,
      session.initial_instructions,
    ) as DevSession;
  }

  updateStatus(id: string, status: DevSessionStatus): void {
    this.stmts.updateStatus.run(status, id);
  }

  updateAutomationPhase(id: string, phase: DevSessionAutomationPhase | null): void {
    this.stmts.updateAutomationPhase.run(phase, id);
  }

  updateWorkflowControls(id: string, executionMode: AgentExecutionMode, reviewPolicy: AgentReviewPolicy): void {
    this.stmts.updateWorkflowControls.run(executionMode, reviewPolicy, id);
  }

  updatePrInfo(id: string, prNumber: number, prUrl: string, prState: string, reviewState: string | null): void {
    this.stmts.updatePrInfo.run(prNumber, prUrl, prState, reviewState, id);
  }

  updateName(id: string, name: string): void {
    this.stmts.updateName.run(name, id);
  }

  updateBaseSha(id: string, baseSha: string): void {
    this.stmts.updateBaseSha.run(baseSha, id);
  }

  updateMergeOrder(id: string, order: number | null): void {
    this.stmts.updateMergeOrder.run(order, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }

  markActiveAsInactive(): void {
    this.stmts.markActiveAsInactive.run();
  }
}
