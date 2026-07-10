import type { Database, Statement } from 'better-sqlite3';
import { parsePlaybook, type Playbook, type PlaybookStep } from '../../../../shared/playbooks';
import type { IPlaybookRepository } from '../../interfaces/playbook';

interface PlaybookRow {
  id: string;
  name: string;
  steps_json: string;
}

interface PreparedStatements {
  list: Statement;
  get: Statement;
  create: Statement;
  update: Statement;
  delete: Statement;
}

function fromRow(row: PlaybookRow): Playbook {
  return parsePlaybook({
    id: row.id,
    name: row.name,
    builtIn: false,
    steps: JSON.parse(row.steps_json) as unknown,
  });
}

export class PlaybookRepository implements IPlaybookRepository {
  private readonly stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      list: db.prepare('SELECT id, name, steps_json FROM execution_playbooks ORDER BY name COLLATE NOCASE, id'),
      get: db.prepare('SELECT id, name, steps_json FROM execution_playbooks WHERE id = ?'),
      create: db.prepare(`
        INSERT INTO execution_playbooks (id, name, steps_json)
        VALUES (?, ?, ?)
        RETURNING id, name, steps_json
      `),
      update: db.prepare(`
        UPDATE execution_playbooks
        SET name = ?, steps_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING id, name, steps_json
      `),
      delete: db.prepare('DELETE FROM execution_playbooks WHERE id = ?'),
    };
  }

  list(): Playbook[] {
    return (this.stmts.list.all() as PlaybookRow[]).map(fromRow);
  }

  get(id: string): Playbook | undefined {
    const row = this.stmts.get.get(id) as PlaybookRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  create(input: { id: string; name: string; steps: PlaybookStep[] }): Playbook {
    const row = this.stmts.create.get(input.id, input.name, JSON.stringify(input.steps)) as PlaybookRow;
    return fromRow(row);
  }

  update(id: string, input: { name: string; steps: PlaybookStep[] }): Playbook | undefined {
    const row = this.stmts.update.get(input.name, JSON.stringify(input.steps), id) as PlaybookRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  delete(id: string): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }
}
