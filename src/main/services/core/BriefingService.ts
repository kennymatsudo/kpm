/**
 * Briefing Service
 *
 *
 * Two-stage pipeline:
 */

import type { BriefingResult, FileNode } from '../../../shared/types';
import type { AsyncResult } from '../result';
import { success, failure } from '../result';
import { getConfig } from '../../config';

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

        INSERT INTO project_briefings (project_id, summary, generated_at, blocked_count, stale_count, ready_count)
        VALUES (?, ?, ?, ?, ?, ?)


  return {
      const project = deps.projects.get(projectId);
      if (!project) {
        return failure('Project not found');
      }


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
        const synthesisContext = `
## Project: ${project.name}

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


        const summary = await callClaude(
          briefingSystemPrompt,
          synthesisContext,
        );

        const elapsed = Date.now() - startTime;
        log(`Briefing complete in ${elapsed}ms`);

          summary,
          generatedAt: new Date().toISOString(),
          signalCounts: {
            blockedCount: context.blockedItems.length,
            staleCount: context.staleItems.length,
            readyCount: context.readyItems.length,
          },
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[BriefingService] Error:', msg);
        return failure(`Briefing generation failed: ${msg}`);
      }
    },
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type BriefingService = ReturnType<typeof createBriefingService>;
