/**
 * Slack Channel Link Repository Implementation
 *
 * Associates KPM projects with Slack channels for triage.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { SlackChannelLink } from '../../../../shared/types';
import type { ISlackChannelLinkRepository, SlackChannelLinkCreate } from '../../interfaces/slack';

interface PreparedStatements {
  getById: Statement;
  getByProject: Statement;
  getByChannelId: Statement;
  insert: Statement;
  updateLastCheckedTs: Statement;
  delete: Statement;
}

export class SlackChannelLinkRepository implements ISlackChannelLinkRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      getById: db.prepare('SELECT * FROM slack_channel_links WHERE id = ?'),
      getByProject: db.prepare(
        'SELECT * FROM slack_channel_links WHERE project_id = ? ORDER BY channel_name'
      ),
      getByChannelId: db.prepare(
        'SELECT * FROM slack_channel_links WHERE project_id = ? AND channel_id = ?'
      ),
      insert: db.prepare(`
        INSERT INTO slack_channel_links (id, project_id, channel_id, channel_name)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `),
      updateLastCheckedTs: db.prepare(
        'UPDATE slack_channel_links SET last_checked_ts = ? WHERE id = ?'
      ),
      delete: db.prepare('DELETE FROM slack_channel_links WHERE id = ?'),
    };
  }

  get(id: string): SlackChannelLink | undefined {
    return this.stmts.getById.get(id) as SlackChannelLink | undefined;
  }

  getByProject(projectId: string): SlackChannelLink[] {
    return this.stmts.getByProject.all(projectId) as SlackChannelLink[];
  }

  getByChannelId(projectId: string, channelId: string): SlackChannelLink | undefined {
    return this.stmts.getByChannelId.get(projectId, channelId) as SlackChannelLink | undefined;
  }

  create(link: SlackChannelLinkCreate): SlackChannelLink {
    const id = randomUUID();
    return this.stmts.insert.get(
      id,
      link.project_id,
      link.channel_id,
      link.channel_name
    ) as SlackChannelLink;
  }

  updateLastCheckedTs(id: string, ts: string): void {
    this.stmts.updateLastCheckedTs.run(ts, id);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}
