/**
 * Action Repository Implementation
 *
 * CRUD for actions. A null `project_id` means the action is available in every
 * project, so project-scoped reads union the project's own rows with the global
 * ones. The trigger is stored as columns rather than JSON so the scheduler can
 * select the rows it needs without parsing every action.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  ACTION_CAPABILITIES,
  type ActionCapability,
  type ActionDefinition,
  type ActionIcon,
  type ActionManualRun,
  type ActionRunOutcome,
  type ActionTargetType,
  type ActionTrigger,
  type ActionTriggerEvent,
} from '../../../../shared/actions';
import type { ClaudeModel } from '../../../../shared/types';
import type { ActionCreate, ActionUpdate, IActionRepository } from '../../interfaces';

interface PreparedStatements {
  listForProject: Statement;
  getById: Statement;
  listEnabledIntervalTriggered: Statement;
  listEnabledForEvent: Statement;
  nameExists: Statement;
  insert: Statement;
  delete: Statement;
  recordRunOutcome: Statement;
  updateMemory: Statement;
}

/** Columns that map one-to-one from an editable field. `trigger` expands separately. */
const COLUMN_FOR_FIELD = {
  name: 'name',
  description: 'description',
  projectId: 'project_id',
  prompt: 'prompt',
  icon: 'icon',
  keywords: 'keywords',
  enabled: 'enabled',
  capabilities: 'capabilities',
  manualRun: 'manual_run',
  targetType: 'target_type',
  model: 'model',
} as const;

type SimpleField = keyof typeof COLUMN_FOR_FIELD;

const KNOWN_CAPABILITIES = new Set<string>(ACTION_CAPABILITIES);

function parseCapabilities(raw: unknown): ActionCapability[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ActionCapability =>
        typeof entry === 'string' && KNOWN_CAPABILITIES.has(entry)
    );
  } catch {
    return [];
  }
}

function rowToTrigger(row: Record<string, unknown>): ActionTrigger {
  switch (row.trigger_kind) {
    case 'interval':
      return { kind: 'interval', minutes: row.trigger_interval_minutes as number };
    case 'event':
      return { kind: 'event', event: row.trigger_event as ActionTriggerEvent };
    default:
      return { kind: 'manual' };
  }
}

function triggerColumns(trigger: ActionTrigger): {
  kind: ActionTrigger['kind'];
  minutes: number | null;
  event: ActionTriggerEvent | null;
} {
  return {
    kind: trigger.kind,
    minutes: trigger.kind === 'interval' ? trigger.minutes : null,
    event: trigger.kind === 'event' ? trigger.event : null,
  };
}

export class ActionRepository implements IActionRepository {
  private stmts: PreparedStatements;

  constructor(private db: Database) {
    this.stmts = {
      listForProject: db.prepare(`
        SELECT * FROM actions
        WHERE project_id = ? OR project_id IS NULL
        ORDER BY created_at DESC
      `),
      getById: db.prepare('SELECT * FROM actions WHERE id = ?'),
      listEnabledIntervalTriggered: db.prepare(
        "SELECT * FROM actions WHERE enabled = 1 AND trigger_kind = 'interval'"
      ),
      listEnabledForEvent: db.prepare(
        "SELECT * FROM actions WHERE enabled = 1 AND trigger_kind = 'event' AND trigger_event = ?"
      ),
      nameExists: db.prepare(`
        SELECT EXISTS (
          SELECT 1 FROM actions
          WHERE name = ?
            AND (project_id IS ?)
            AND id != COALESCE(?, '')
          LIMIT 1
        ) AS exists_flag
      `),
      insert: db.prepare(`
        INSERT INTO actions (
          id, name, description, project_id, prompt, icon, keywords,
          trigger_kind, trigger_interval_minutes, trigger_event,
          enabled, capabilities, manual_run, target_type, model, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM actions WHERE id = ?'),
      recordRunOutcome: db.prepare(`
        UPDATE actions
        SET last_run_at = ?, last_outcome = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateMemory: db.prepare(`
        UPDATE actions
        SET memory = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
    };
  }

  private rowToAction(row: Record<string, unknown>): ActionDefinition {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? '',
      projectId: (row.project_id as string | null) ?? null,
      prompt: row.prompt as string,
      icon: row.icon as ActionIcon,
      keywords: (row.keywords as string | null) ?? '',
      trigger: rowToTrigger(row),
      enabled: Boolean(row.enabled),
      capabilities: parseCapabilities(row.capabilities),
      manualRun: row.manual_run as ActionManualRun,
      targetType: row.target_type as ActionTargetType,
      model: (row.model as ClaudeModel | null) ?? null,
      memory: (row.memory as string | null) ?? null,
      lastRunAt: (row.last_run_at as string | null) ?? null,
      lastOutcome: (row.last_outcome as ActionRunOutcome | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  listForProject(projectId: string): ActionDefinition[] {
    const rows = this.stmts.listForProject.all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAction(row));
  }

  get(id: string): ActionDefinition | undefined {
    const row = this.stmts.getById.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToAction(row) : undefined;
  }

  listEnabledIntervalTriggered(): ActionDefinition[] {
    const rows = this.stmts.listEnabledIntervalTriggered.all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToAction(row));
  }

  listEnabledForEvent(event: ActionTriggerEvent): ActionDefinition[] {
    const rows = this.stmts.listEnabledForEvent.all(event) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAction(row));
  }

  nameExists(projectId: string | null, name: string, excludeId?: string): boolean {
    const row = this.stmts.nameExists.get(name, projectId, excludeId ?? null) as {
      exists_flag: number;
    };
    return row.exists_flag === 1;
  }

  create(action: ActionCreate): ActionDefinition {
    const id = randomUUID();
    const now = new Date().toISOString();
    const trigger = triggerColumns(action.trigger);
    const row = this.stmts.insert.get(
      id,
      action.name,
      action.description,
      action.projectId,
      action.prompt,
      action.icon,
      action.keywords,
      trigger.kind,
      trigger.minutes,
      trigger.event,
      action.enabled ? 1 : 0,
      JSON.stringify(action.capabilities),
      action.manualRun,
      action.targetType,
      action.model,
      now,
      now
    ) as Record<string, unknown>;
    return this.rowToAction(row);
  }

  update(id: string, updates: ActionUpdate): ActionDefinition | undefined {
    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const field of Object.keys(COLUMN_FOR_FIELD) as SimpleField[]) {
      const value = updates[field];
      if (value === undefined) continue;
      assignments.push(`${COLUMN_FOR_FIELD[field]} = ?`);
      if (field === 'enabled') values.push(value ? 1 : 0);
      else if (field === 'capabilities') values.push(JSON.stringify(value));
      else values.push(value);
    }

    if (updates.trigger !== undefined) {
      const trigger = triggerColumns(updates.trigger);
      assignments.push('trigger_kind = ?', 'trigger_interval_minutes = ?', 'trigger_event = ?');
      values.push(trigger.kind, trigger.minutes, trigger.event);
    }

    if (assignments.length === 0) return this.get(id);

    // Dynamic update (uncommon path, ok to prepare each time).
    const stmt = this.db.prepare(`
      UPDATE actions
      SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `);
    const row = stmt.get(...values, id) as Record<string, unknown> | undefined;
    return row ? this.rowToAction(row) : undefined;
  }

  delete(id: string): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }

  recordRunOutcome(
    id: string,
    outcome: ActionRunOutcome,
    error: string | null,
    ranAt: string
  ): void {
    this.stmts.recordRunOutcome.run(ranAt, outcome, error, id);
  }

  updateMemory(id: string, memory: string): void {
    this.stmts.updateMemory.run(memory, id);
  }
}
