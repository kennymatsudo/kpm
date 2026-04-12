/**
 * Slack Triage Item Repository Implementation
 *
 * Manages the triage queue of actionable items identified from Slack channels.
 */

import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { SlackTriageItem, SlackTriageStatus } from '../../../../shared/types';
import type { ISlackTriageItemRepository, SlackTriageItemCreate } from '../../interfaces/slack';

interface PreparedStatements {
  getById: Statement;
  getByProject: Statement;
  getPending: Statement;
  getPriorTopics: Statement;
  getDismissedForThread: Statement;
  insert: Statement;
  updateStatus: Statement;
  updateStatusWithResolvedAt: Statement;
  updateSuggestedAction: Statement;
  countPending: Statement;
}

export class SlackTriageItemRepository implements ISlackTriageItemRepository {
  private db: Database;
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      getById: db.prepare('SELECT * FROM slack_triage_items WHERE id = ?'),
      getByProject: db.prepare(`
        SELECT ti.* FROM slack_triage_items ti
        JOIN slack_channel_links cl ON ti.channel_link_id = cl.id
        WHERE cl.project_id = ?
        ORDER BY ti.created_at DESC
      `),
      getPending: db.prepare(`
        SELECT ti.* FROM slack_triage_items ti
        JOIN slack_channel_links cl ON ti.channel_link_id = cl.id
        WHERE cl.project_id = ? AND ti.status = 'pending'
        ORDER BY ti.created_at DESC
      `),
      getPriorTopics: db.prepare(
        'SELECT topic_summary, status FROM slack_triage_items WHERE channel_link_id = ?'
      ),
      getDismissedForThread: db.prepare(
        "SELECT * FROM slack_triage_items WHERE channel_link_id = ? AND thread_ts = ? AND status = 'dismissed'"
      ),
      insert: db.prepare(`
        INSERT INTO slack_triage_items (
          id, channel_link_id, source_messages, thread_ts, latest_reply_ts,
          author_name, source_text, topic_summary, action_type,
          suggested_action, context_used, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        RETURNING *
      `),
      updateStatus: db.prepare(
        'UPDATE slack_triage_items SET status = ? WHERE id = ?'
      ),
      updateStatusWithResolvedAt: db.prepare(
        'UPDATE slack_triage_items SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
      ),
      updateSuggestedAction: db.prepare(
        'UPDATE slack_triage_items SET suggested_action = ? WHERE id = ?'
      ),
      countPending: db.prepare(`
        SELECT COUNT(*) as count FROM slack_triage_items ti
        JOIN slack_channel_links cl ON ti.channel_link_id = cl.id
        WHERE cl.project_id = ? AND ti.status = 'pending'
      `),
    };
  }

  get(id: string): SlackTriageItem | undefined {
    const row = this.stmts.getById.get(id) as RawTriageRow | undefined;
    return row ? deserializeRow(row) : undefined;
  }

  getByProject(projectId: string): SlackTriageItem[] {
    const rows = this.stmts.getByProject.all(projectId) as RawTriageRow[];
    return rows.map(deserializeRow);
  }

  getPending(projectId: string): SlackTriageItem[] {
    const rows = this.stmts.getPending.all(projectId) as RawTriageRow[];
    return rows.map(deserializeRow);
  }

  getExistingMessageTs(channelLinkId: string, statuses: SlackTriageStatus[]): Set<string> {
    if (statuses.length === 0) return new Set();
    const placeholders = statuses.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT source_messages FROM slack_triage_items WHERE channel_link_id = ? AND status IN (${placeholders})`
    );
    const rows = stmt.all(channelLinkId, ...statuses) as { source_messages: string }[];
    const tsSet = new Set<string>();
    for (const row of rows) {
      const messages: string[] = JSON.parse(row.source_messages);
      for (const ts of messages) {
        tsSet.add(ts);
      }
    }
    return tsSet;
  }

  getPriorTopics(channelLinkId: string): { topic_summary: string; status: SlackTriageStatus }[] {
    return this.stmts.getPriorTopics.all(channelLinkId) as {
      topic_summary: string;
      status: SlackTriageStatus;
    }[];
  }

  getDismissedForThread(channelLinkId: string, threadTs: string): SlackTriageItem[] {
    const rows = this.stmts.getDismissedForThread.all(channelLinkId, threadTs) as RawTriageRow[];
    return rows.map(deserializeRow);
  }

  createBatch(items: SlackTriageItemCreate[]): SlackTriageItem[] {
    const results: SlackTriageItem[] = [];
    const transaction = this.db.transaction(() => {
      for (const item of items) {
        const id = randomUUID();
        const row = this.stmts.insert.get(
          id,
          item.channel_link_id,
          JSON.stringify(item.source_messages),
          item.thread_ts,
          item.latest_reply_ts,
          item.author_name,
          item.source_text,
          item.topic_summary,
          item.action_type,
          item.suggested_action ? JSON.stringify(item.suggested_action) : null,
          item.context_used ? JSON.stringify(item.context_used) : null
        ) as RawTriageRow;
        results.push(deserializeRow(row));
      }
    });
    transaction();
    return results;
  }

  updateStatus(id: string, status: SlackTriageStatus): void {
    if (status === 'approved' || status === 'edited' || status === 'dismissed' || status === 'executed') {
      this.stmts.updateStatusWithResolvedAt.run(status, id);
    } else {
      this.stmts.updateStatus.run(status, id);
    }
  }

  updateSuggestedAction(id: string, suggestedAction: unknown): void {
    this.stmts.updateSuggestedAction.run(JSON.stringify(suggestedAction), id);
  }

  countPending(projectId: string): number {
    const result = this.stmts.countPending.get(projectId) as { count: number };
    return result.count;
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Raw row from SQLite before JSON deserialization */
interface RawTriageRow extends Omit<SlackTriageItem, 'source_messages' | 'suggested_action' | 'context_used'> {
  source_messages: string;
  suggested_action: string | null;
  context_used: string | null;
}

function deserializeRow(row: RawTriageRow): SlackTriageItem {
  return {
    ...row,
    source_messages: JSON.parse(row.source_messages),
    suggested_action: row.suggested_action ? JSON.parse(row.suggested_action) : null,
    context_used: row.context_used ? JSON.parse(row.context_used) : null,
  };
}
