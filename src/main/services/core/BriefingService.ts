/**
 * Briefing Service
 *
 *
 * Two-stage pipeline:
 */

import type { Database, Statement } from 'better-sqlite3';
import type { BriefingResult, FileNode } from '../../../shared/types';
import type { AsyncResult } from '../result';
import { success, failure } from '../result';
import { getConfig } from '../../config';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';

// =============================================================================
// Types
// =============================================================================

interface StatusSummaryRow {
  status_category: string;
  count: number;
}

interface BlockedItemRow {
  id: string;
  title: string;
  blocked_by_ids: string | null;
  blocked_by_titles: string | null;
}

interface StaleItemRow {
  id: string;
  title: string;
  days_since_update: number;
}

interface ReadyItemRow {
  id: string;
  title: string;
}

interface InProgressItemRow {
  id: string;
  title: string;
  days_since_update: number;
}

interface InactiveSessionRow {
  id: string;
  plan_item_title: string;
  branch_name: string;
  days_since_update: number;
}

interface ChatMessageRow {
  role: string;
  content: string;
  created_at: string;
}

interface BriefingContext {
  statusSummary: StatusSummaryRow[];
  blockedItems: BlockedItemRow[];
  staleItems: StaleItemRow[];
  readyItems: ReadyItemRow[];
  inProgressItems: InProgressItemRow[];
  inactiveDevSessions: InactiveSessionRow[];
  recentMessages: ChatMessageRow[];
  recentlyModifiedFiles: { path: string; modifiedAt: string; size: number }[];
}

// =============================================================================
// Dependencies
// =============================================================================

export interface BriefingServiceDeps {
  getDatabase: () => Database;
  getPromptContent: (key: string) => string;
  fileExplorerService: {
  };
  projects: {
    get: (projectId: string) => { id: string; name: string; folder_path: string | null } | undefined;
  };
}

// =============================================================================
// =============================================================================

}

}


      statusSummary: db.prepare(`
        SELECT status_category, COUNT(*) as count
        FROM plan_items
        WHERE project_id = ? AND status_category IS NOT NULL
        GROUP BY status_category
      `),
      blockedItems: db.prepare(`
        SELECT
          pi.id,
          pi.title,
          GROUP_CONCAT(blocker.id) as blocked_by_ids,
          GROUP_CONCAT(blocker.title, ' | ') as blocked_by_titles
        FROM plan_items pi
        LEFT JOIN plan_relations pr ON pr.from_item_id = pi.id AND pr.relation_type = 'depends_on'
        LEFT JOIN plan_items blocker ON blocker.id = pr.to_item_id AND blocker.status_category != 'done'
        WHERE pi.project_id = ? AND pi.status_category = 'blocked'
        GROUP BY pi.id
      `),
      staleItems: db.prepare(`
        SELECT
          id,
          title,
          CAST(julianday('now') - julianday(updated_at) AS INTEGER) as days_since_update
        FROM plan_items
        WHERE project_id = ?
          AND status_category = 'in_progress'
          AND updated_at < datetime('now', '-7 days')
        ORDER BY updated_at ASC
        LIMIT 20
      `),
      readyItems: db.prepare(`
        SELECT pi.id, pi.title
        FROM plan_items pi
        WHERE pi.project_id = ?
          AND pi.status_category = 'not_started'
          AND NOT EXISTS (
            SELECT 1
            FROM plan_relations pr
            JOIN plan_items dep ON dep.id = pr.to_item_id
            WHERE pr.from_item_id = pi.id
              AND pr.relation_type = 'depends_on'
              AND dep.status_category != 'done'
          )
        ORDER BY pi.item_order
        LIMIT 20
      `),
      inProgressItems: db.prepare(`
        SELECT
          id,
          title,
          CAST(julianday('now') - julianday(updated_at) AS INTEGER) as days_since_update
        FROM plan_items
        WHERE project_id = ? AND status_category = 'in_progress'
        ORDER BY updated_at DESC
        LIMIT 20
      `),
      inactiveDevSessions: db.prepare(`
        SELECT
          ds.id,
          pi.title as plan_item_title,
          ds.branch_name,
          CAST(julianday('now') - julianday(ds.updated_at) AS INTEGER) as days_since_update
        FROM dev_sessions ds
        JOIN plan_items pi ON pi.id = ds.plan_item_id
        WHERE ds.project_id = ? AND ds.status = 'inactive'
        ORDER BY ds.updated_at DESC
        LIMIT 10
      `),
      recentMessages: db.prepare(`
        SELECT role, content, created_at
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
      `),
      upsertBriefing: db.prepare(`
        INSERT INTO project_briefings (project_id, summary, generated_at, blocked_count, stale_count, ready_count)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          summary = excluded.summary,
          generated_at = excluded.generated_at,
          blocked_count = excluded.blocked_count,
          stale_count = excluded.stale_count,
          ready_count = excluded.ready_count
      `),
      getBriefing: db.prepare(`
        SELECT * FROM project_briefings WHERE project_id = ?
      `),
    };
  }


  return {
      const project = deps.projects.get(projectId);
      if (!project) {
        return failure('Project not found');
      }

      const generationConfig = getConfig().generation;
      const timeoutMs = generationConfig.briefingStageTimeoutMs;

      try {
        log(`Generating briefing for project "${project.name}" (${projectId})`);
        const startTime = Date.now();


        if (project.folder_path) {
          try {
            if (filesResult.ok) {
                .filter((f) => !f.isDirectory)
                .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
                .map((f) => ({ path: f.name, modifiedAt: f.modifiedAt, size: f.size }));
            }
          } catch {
            // Non-critical — file listing can fail if no folder configured
          }
        }



Produce a structured summary with these sections:
- **Commitments made**: Things the user said they would do (e.g., "I'll handle X", "Let me work on Y")
- **Priorities discussed**: What the user considers important or urgent
- **Open questions**: Unresolved questions or decisions
- **Decisions reached**: Conclusions or choices made
- **Unresolved threads**: Topics discussed but not concluded

Messages:

        log(`Stage 1 complete in ${Date.now() - startTime}ms`);


        const briefingPrompt = deps.getPromptContent('generation.briefing_instructions');
        const today = new Date().toISOString().split('T')[0];

        const synthesisContext = `
## Project: ${project.name}
## Current Date: ${today}

## Plan Status Summary
${context.statusSummary.map((s) => `- ${s.status_category}: ${s.count}`).join('\n') || 'No plan items.'}

## Blocked Items (${context.blockedItems.length})
${context.blockedItems.map((b) => `- "${b.title}" — blocked by: ${b.blocked_by_titles || 'unknown'}`).join('\n') || 'None.'}

## Stale Items (in_progress for 7+ days) (${context.staleItems.length})
${context.staleItems.map((s) => `- "${s.title}" — ${s.days_since_update} days since update`).join('\n') || 'None.'}

## Items Ready to Start (${context.readyItems.length})
${context.readyItems.map((r) => `- "${r.title}"`).join('\n') || 'None.'}

## Currently In Progress (${context.inProgressItems.length})
${context.inProgressItems.map((ip) => `- "${ip.title}" — ${ip.days_since_update} days since update`).join('\n') || 'None.'}

## Inactive Dev Sessions (${context.inactiveDevSessions.length})
${context.inactiveDevSessions.map((d) => `- "${d.plan_item_title}" on branch ${d.branch_name} — ${d.days_since_update} days idle`).join('\n') || 'None.'}

## Recently Modified Files

## Chat History Synthesis (PRIMARY PRIORITY SIGNAL)

        const briefingSystemPrompt = `You are a project planning assistant generating a prioritized briefing for a developer.

${briefingPrompt}

IMPORTANT: The chat history synthesis is the STRONGEST signal for priority ordering. The user's own words and commitments drive what matters most. Structured data (blocked items, stale work) provides supporting context.

Output a concise, actionable markdown briefing. Use sections like:
- **Top Priority**: What to focus on right now (1-3 items)
- **Needs Attention**: Stale items, blocked work, unresolved threads
- **Ready to Start**: Items with met dependencies
- **Idle Dev Sessions**: Branches that might need cleanup or resuming

NEVER use emojis, colored circles, or status indicators. No icons of any kind. Use plain markdown only — headers, bold, lists, and text. Be direct and utilitarian. Lead with actions, not narration.`;

        const summary = await callClaude(
          generationConfig.deepModel,
          briefingSystemPrompt,
          synthesisContext,
        );

        const elapsed = Date.now() - startTime;
        log(`Briefing complete in ${elapsed}ms`);

        const briefingResult: BriefingResult = {
          summary,
          generatedAt: new Date().toISOString(),
          signalCounts: {
            blockedCount: context.blockedItems.length,
            staleCount: context.staleItems.length,
            readyCount: context.readyItems.length,
          },
        };

        try {
            projectId,
            briefingResult.summary,
            briefingResult.generatedAt,
            briefingResult.signalCounts.blockedCount,
            briefingResult.signalCounts.staleCount,
            briefingResult.signalCounts.readyCount,
          );
        } catch (e) {
          // Non-critical — log but don't fail the briefing
          console.error('[BriefingService] Failed to persist briefing:', e);
        }

        return success(briefingResult);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[BriefingService] Error:', msg);
        return failure(`Briefing generation failed: ${msg}`);
      }
    },

    getBriefing(projectId: string): BriefingResult | null {
      try {
        if (!row) return null;
        return {
          summary: row.summary,
          generatedAt: row.generated_at,
          signalCounts: {
            blockedCount: row.blocked_count,
            staleCount: row.stale_count,
            readyCount: row.ready_count,
          },
        };
      } catch (e) {
        console.error('[BriefingService] Failed to load briefing:', e);
        return null;
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type BriefingService = ReturnType<typeof createBriefingService>;
