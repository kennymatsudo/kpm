import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DevSessionWithPlanItem, PlanItem } from '../../../shared/types';
import type { ReviewRunRecord } from '../../stores/devSessions';
import { createActivityFeed } from './activityPresentation';
import { BoardCard } from './BoardCard';
import { DetailPane } from './DetailPane';
import { TooltipProvider } from '../ui';

/**
 * Regression coverage for the bug fixed alongside `resolveReviewRuntime`:
 * `BoardCard` used to derive the review session id with the legacy
 * `toReviewSessionId(implId)` helper directly instead of asking the picker,
 * so a playbook review run recorded under a different id (the normal case —
 * see `reviewSession.ts`) never showed up on the card even though the detail
 * pane (which already called the picker) showed it correctly.
 *
 * This renders the real `BoardCard` and `DetailPane` components against one
 * shared store fixture with such a run recorded, and asserts both surfaces
 * narrate the same review run. Before the fix, `DetailPane` would show the
 * review's own "failed" narration while `BoardCard` showed nothing for it
 * (or the implementation session's stale state) — this test fails on that
 * drift instead of only on the picker's own unit tests, which can't see a
 * call site bypassing the picker entirely.
 */

const IMPL_SESSION_ID = 'impl-1';
const ITEM_ID = 'item-1';
const REVIEW_RUN_ID = `${IMPL_SESSION_ID}-playbook-review-0-0`;
const REVIEW_SUMMARY = 'Reviewer flagged a missing test for the export boundary';

const planItem: PlanItem = {
  id: ITEM_ID,
  parent_id: null,
  title: 'Add export boundary check',
  description: null,
  intent: null,
  acceptance_criteria: null,
  work_brief_revision: 1,
  source_document_id: null,
  label: null,
  item_order: 0,
  code_refs: null,
  status: 'planned',
  release_tag: null,
  position_x: null,
  position_y: null,
  group_id: null,
  external_key: null,
  external_id: null,
  external_type: null,
  external_status: null,
  status_category: 'in_progress',
  external_url: null,
  association_id: null,
  external_issue_type: null,
  external_parent_key: null,
  external_epic_key: null,
  sync_source: 'local',
  last_synced_at: null,
};

const implementationSession: DevSessionWithPlanItem = {
  id: IMPL_SESSION_ID,
  project_id: 'project-1',
  plan_item_id: ITEM_ID,
  repo_id: 'repo-1',
  name: 'Session',
  worktree_path: '/tmp/worktree',
  branch_name: 'work',
  base_branch: 'main',
  base_sha: null,
  // Mid-automation: the impl session itself is already inactive, so the card
  // must fall back to `isLiveAutomationPhase` to keep treating it as live —
  // see the comment on this fallback in BoardCard's selector.
  status: 'inactive',
  agent_type: 'claude',
  review_policy: 'auto',
  automation_phase: 'reviewing',
  playbook_id: 'playbook-1',
  playbook_snapshot: null,
  current_step_id: 'review',
  step_pass_counts: null,
  step_outputs: null,
  paused_reason: null,
  initial_instructions: 'Do it',
  work_brief_revision: 1,
  pr_number: null,
  pr_url: null,
  pr_state: null,
  review_state: null,
  pr_is_draft: false,
  merge_order: null,
  created_at: '2026-01-01T10:00:00.000Z',
  updated_at: '2026-01-01T10:00:00.000Z',
  completed_at: null,
  repo_name: 'repo',
  plan_item: planItem,
};

const reviewRuns: ReviewRunRecord[] = [
  { sessionId: REVIEW_RUN_ID, stepId: 'review', runIndex: 0 },
];

const reviewActivity = {
  type: 'error' as const,
  timestamp: Date.now(),
  summary: REVIEW_SUMMARY,
  status: 'failed' as const,
};

const fakeState = {
  sessionsByPlanItemId: new Map([[ITEM_ID, [implementationSession]]]),
  sessionById: new Map([[IMPL_SESSION_ID, implementationSession]]),
  sessions: [implementationSession],
  agentStateBySessionId: new Map([[REVIEW_RUN_ID, 'failed' as const]]),
  reviewRunsByImplementationId: new Map([[IMPL_SESSION_ID, reviewRuns]]),
  latestActivityBySessionId: new Map([[REVIEW_RUN_ID, reviewActivity]]),
  activityFeedBySessionId: new Map([[REVIEW_RUN_ID, createActivityFeed([reviewActivity])]]),
  questionBySessionId: new Map(),
  completionBySessionId: new Map(),
  mergeOrderBySessionId: new Map(),
  reviewActionableBySessionId: new Map(),
  reviewInboxBySessionId: new Map(),
  reviewAssessmentPendingBySessionId: new Map(),
  commitStateBySessionId: new Map(),
  diffBySessionId: new Map(),
  stepCostsBySessionId: new Map(),
  setCommitState: vi.fn(),
  loadDiff: vi.fn(),
  loadStepCosts: vi.fn(),
  hydrateAgentSnapshot: vi.fn(),
};

vi.mock('../../stores/devSessions', () => ({
  useDevSessionsStore: (selector: (state: typeof fakeState) => unknown) => selector(fakeState),
}));

const storesState = {
  repos: [],
  planItems: [planItem],
  addFocusedResource: vi.fn(),
};

vi.mock('../../stores', () => ({
  useResourceDomainStore: (selector: (state: typeof storesState) => unknown) => selector(storesState),
  usePlanDomainStore: (selector: (state: typeof storesState) => unknown) => selector(storesState),
  useProjectUiDomainStore: (selector: (state: typeof storesState) => unknown) => selector(storesState),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// Modal-based children reference `document.body` unconditionally (real
// `createPortal` call, not gated on `isOpen`), which throws outside a DOM
// environment. They render nothing relevant to review-runtime resolution, so
// they're stubbed out rather than pulled into this test's DOM requirements.
vi.mock('../development/CreatePrModal', () => ({ CreatePrModal: () => null }));
vi.mock('../development/GeneratePrContentModal', () => ({ GeneratePrContentModal: () => null }));
vi.mock('../development/LinkPrDialog', () => ({ LinkPrDialog: () => null }));

function renderBoardCard(): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <BoardCard
        item={planItem}
        breadcrumb={[]}
        isSelected={false}
        isFocused={false}
        searchQuery=""
        onSelect={() => undefined}
        onEdit={() => undefined}
        onContextMenu={() => undefined}
        onDragStart={() => undefined}
        onDragEnd={() => undefined}
        onStopAgent={vi.fn()}
      />
    </TooltipProvider>
  );
}

function renderDetailPane(): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <DetailPane session={implementationSession} onClose={() => undefined} />
    </TooltipProvider>
  );
}

describe('review runtime consistency across board surfaces', () => {
  it('shows the same recorded playbook review run on the card and in the detail pane', () => {
    const cardMarkup = renderBoardCard();
    const detailMarkup = renderDetailPane();

    // Sanity: the fixture's review run is genuinely under a different id than
    // the legacy `${implId}-review` id BoardCard used to hardcode.
    expect(REVIEW_RUN_ID).not.toBe(`${IMPL_SESSION_ID}-review`);

    expect(cardMarkup).toContain(REVIEW_SUMMARY);
    expect(detailMarkup).toContain(REVIEW_SUMMARY);
  });
});
