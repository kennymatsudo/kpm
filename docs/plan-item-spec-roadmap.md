# Plan Item Spec — Continuation Roadmap

> and the CLAUDE.md files under `src/main/claude/`, `src/main/db/`, and
> `src/renderer/`.
>

## Why this work exists

The lossy seam was at planning → execution: `PlanItem` carried only `title` +
`description` (prose), and three separate prompt builders flattened that prose
differently into agent context. Every downstream consumer (agent, reviewer, PR
description, weekly update) re-parsed the same prose, differently.

The intervention is a **spec schema on plan items** that flows structured
context through those consumers deterministically. See `src/main/claude/CLAUDE.md`
section "Plan Item Spec Fields" for the field table.

## What's shipped (phases 1–3)

### Phase 1 — Plumbing

- Migration `1073_add_plan_item_spec_fields` adds three columns to `plan_items`:
  `intent` (TEXT), `acceptance_criteria` (TEXT, JSON-encoded string[]),
  `source_document_id` (TEXT). See `src/main/db/migrations.ts`.
- `PlanItemBase` in `src/shared/base-types.ts` carries the three fields.
- `PlanItemUpdates` (`src/shared/types.ts`) widened accordingly.
- `PlanItemRepository` (`src/main/db/repositories/impl/PlanItemRepository.ts`)
  serializes `acceptance_criteria` as JSON using the shared `parseStringArray`
  helper; INSERT + dynamic UPDATE + `updateAll` all carry the new fields.
- Zod `planItemUpdates` schema (`src/main/ipc/validation/plan.ts`) accepts the
  fields with bounds: `intent ≤ 500 chars`, `acceptance_criteria ≤ 50 items`,
  each criterion ≤ 1000 chars.
- `planActionSchema` `create_item` and `update_item` entries widened.
- `modify_plan` tool docstring in `src/main/claude/tools/plan-changes.ts`
  promotes `intent` + `acceptance_criteria` as the primary shape for
  implementation items, keeps `description` as the rationale/story, and
  nudges Claude to use `description` alone for exploratory/research items.
- `DevSessionService.buildAgentContext` in
  `src/main/services/repo/DevSessionService.ts` renders `## Intent` +
  `## Acceptance Criteria` (checklist) and demotes `description` to `## Context`
  when structured fields carry the contract. Exported for unit testing.
- `PlanActionService.executeCreateItem` writes all three fields through.

**Tests:** `tests/services/buildAgentContext.test.ts`,
`tests/ipc/planActionSchema.test.ts`, `tests/services/PlanActionExecutor.specFields.test.ts`,
plus the extended `tests/repositories/PlanItemRepository.test.ts`.

### Phase 2 — Visibility

- `TaskEditModal` showed a read-only Spec section between Description and
  Type/Status (intent one-liner + acceptance-criteria checklist). Hidden
  entirely when both fields are null (legacy items unchanged).
- `BoardCard` gained a criteria-count chip in the footer metadata row. Only
  renders when criteria exist. Flex-based — no masonry height-calc risk.
- Canvas `PlanCard.tsx` deliberately NOT wired — three-file height-calc sync
  cost deemed not worth it without evidence the canvas view needs it.

### Phase 2.5 — Sync boundary hardening

- `modify_plan` tool docstring now labels each spec field **local-only** vs.
  **synced to Jira/Linear** and explicitly forbids embedding local-only
  paths) inside `description`. Repo-relative code paths remain fine.
- Guard comments on both `createIssue` and `updateIssue` payloads in
  `ExportService.ts` — spec fields are intentionally local-only, don't add
  without an explicit product decision.
- `src/main/claude/CLAUDE.md` has a "Sync boundary" subsection codifying the
  what-syncs vs. what's-local table.

### Phase 3 — Control (editability)

- `TaskEditModal`'s Spec section is now **editable**:
  - Intent becomes a textarea (500-char cap).
  - Acceptance criteria becomes an editable list with per-row text input,
    inline remove button, explicit "Add criterion" button, 50-item cap.
  - Section is always rendered (even for legacy items) so the concept is
    discoverable and addable. Empty states show affordances, not clutter.
  - Sanitize-on-save: trim + drop empty rows + cap at MAX_CRITERIA only when
    building the save payload. Don't destroy in-progress empty rows.
- `TaskEditModalProps.onSave` widened to accept optional `intent` and
  `acceptance_criteria`. `usePlanTaskEdit.handleSaveTask` passes them through
  to the existing `updatePlanItem` IPC path. No service-layer changes needed
  (phase-1 Zod + repository already accept the fields).
- Dirty-tracking widened; save button disabled if limits exceeded.

### Cleanup (shipped alongside phase 3)

The following unused surface was removed to prevent misdirection in future
audits:

- `document:*` channel declarations in `src/main/ipc/channels.ts` (seven
  entries, no handlers registered anywhere).
- `documents` API object in `src/preload/api.ts` (45 lines, no renderer
  consumers).
- `Document` and `DocumentWithContent` type definitions in
  `src/shared/types.ts` (only used by the removed preload API).

**Kept** (still in use):
- `documents` DB table — BriefingService reads it gracefully (empty case
  handled).
- `propose_document_create` / `propose_document_edit` Claude tools — write
  markdown **files to disk** in the project folder (not DB rows).
- `DocumentUpdatePayload` plumbing — used by the tools above.


## What to observe before starting phase 4

We've been shipping phases without evidence from real use. Before committing
to phase 4, run the app for a few days with real work and answer:

1. **Does Claude reliably populate `intent` + `acceptance_criteria`?**


   ```
   sqlite3 "$HOME/Library/Application Support/KPM - Planning Workbench/planner.db" \
   ```


2. **Does the editable modal feel right, or do you bypass it?**

   - If you open the modal to refine specs: phase 3 worked, continue.
   - If you re-prompt Claude out of habit: the modal discovery is the issue.
     Consider making the Spec section more prominent in the modal OR adding
     an inline "Edit spec" affordance to BoardCard.

3. **Does the BoardCard chip match items where you expect criteria?**

   - If chips appear on ~most implementation items: visibility is working.
   - If chips are sparse: signal points at #1 (Claude not populating).

4. **Do you feel the lack of agent-reported completion?**

   - When agents finish, do you still re-verify prose? → 4a delivers value.
   - If the workflow already feels complete → 4a is polish, skip to 4c.

5. **Do you feel the lack of doc → plan breadcrumb?**

   - When creating items from an iteration doc, does the loss of provenance
     bite? → 4c is high-priority.
   - If you rarely revisit the source doc → 4c is lower priority.

**Do not start phase 4 without evidence on at least questions 1 and 2.**
Building more structure on an unused foundation wastes sprint budget.

## Phase 4a — Manual criterion ticking (recommended next, if evidence supports)

**What the user feels.** Each criterion becomes a clickable checkbox. You tick
them as you verify the agent's work. Return to an item later, see "3 of 5
verified." BoardCard chip becomes `3/5` instead of `5`.

**Why first.** Closes the verification-loop gap (priority #3 from product
direction) at the lowest risk. Doesn't depend on agent self-certification.
Builds the **criterion status data shape** that phase 4d will need.

### Design

Schema change — pick one and commit:

**Option A (recommended): embed status in the JSON array.**

Change `acceptance_criteria` column shape from `string[]` to `{text: string; status: 'open'|'passed'|'failed'}[]`.
One migration, reads `parseStringArray` becomes a more permissive parser.

Pros: all data lives in one column, easy to query, no join.
Cons: requires migrating existing JSON values (if any exist) to the new shape.

**Option B: parallel status array.**

Add `criterion_status` column: JSON-encoded `('open'|'passed'|'failed')[]`
indexed by position in `acceptance_criteria`.

Pros: no migration of existing data, additive only.
Cons: two arrays must stay in sync; reorder/remove ops must touch both;
fragile to index drift.

**Decision: Option A.** Worth the one-time migration cost to avoid permanent
index-sync risk. Existing rows with string[] criteria backfill as
`{text, status: 'open'}[]` in the migration.

### Scope (one sprint)

| Layer | Work |
|-------|------|
| `src/shared/base-types.ts` | Change `acceptance_criteria` type to `{text: string; status: 'open'|'passed'|'failed'}[] \| null` |
| `PlanItemRepository` | Parser updates; writer serialization |
| `PlanItemUpdates` + Zod | Widen `acceptance_criteria` schema |
| `PlanAction.update_item.updates` | Widen type + Zod |
| `modify_plan` tool docstring | Describe the new shape; Claude emits objects with `status: 'open'` by default |
| `PlanActionService.executeCreateItem` | Handle new shape |
| `DevSessionService.buildAgentContext` | Render as `- [x]` for passed, `- [ ]` for open, `- [FAIL]` for failed; agent prompt includes "these criteria already pass, focus on the rest" |
| `TaskEditModal` | Checkboxes become interactive; click toggles open↔passed; right-click or menu for failed |
| `BoardCard` | Chip renders `passed/total` |
| Tests | Update all factories; migration test; new status-toggle rendering test |

**Risk.** Medium — the schema migration is the biggest item. Test the
migration against a real DB copy before shipping.

**Open question.** Should `status: 'failed'` block the item from being marked
`done`? Suggest: yes, enforce in `updateStatusCategory` (warn user "N criteria
failed; mark done anyway?"). But scope this as a follow-up, not sprint 4a.

## Phase 4c — Doc → plan-item extraction (file-path anchor)

**What the user feels.** "Extract plan items from this doc" becomes a named
flow. Each extracted item carries a breadcrumb back to the source markdown
file. Click "Extracted from [doc title]" in the modal → opens the file.

**Architectural decision (already made): file-path anchor, not DB row.**

Rationale: the user's iteration docs live as markdown files in the project
folder (written by Claude via `propose_document_create`). Nothing populates
the `documents` DB table today and building that pipeline is out of scope.

### Scope (~one sprint)

| Layer | Work |
|-------|------|
| `src/shared/base-types.ts` | Rename `source_document_id` → `source_document_path` (string, project-relative) |
| `PlanItemRepository` | Rename in INSERT/UPDATE/rowToPlanItem |
| `PlanItemUpdates`, `PlanAction`, Zod | Rename |
| `PlanActionService` | Rename in executor |
| `modify_plan` tool docstring | Update — instruct Claude to set `source_document_path` when extracting items from a project markdown file the user has referenced; path must be project-relative |
| New Claude tool: `list_project_markdown_files` | Thin wrapper over `FileExplorerService.listDirectory` filtered to `.md`/`.mdx`. Returns `{path, title (first H1 or filename), modified_at}[]` |
| `TaskEditModal` | Show "Extracted from: `{path}`" with a click-to-open action (uses existing `openExternalUrl` or `shell.openPath`) when `source_document_path` is set |
| `BoardCard` | Optional: small paperclip icon when item has a source doc. Skip for sprint-1 cut. |
| Sync boundary | `source_document_path` stays **local-only** per existing policy; add to the what-syncs table in `src/main/claude/CLAUDE.md` |
| Tests | Rename in all factories/tests; new test for the list tool; round-trip test |

**Prompt guidance for the modify_plan docstring (append to existing "Sync boundary" section):**

> When the user asks you to extract plan items from a project document
> (e.g., "create tasks from design.md"), set `source_document_path` on each
> created item to the project-relative path of the source file. This
> preserves the link from plan item back to discovery context. Never
> reference this path inside `description` — descriptions sync to Jira.

**Risk.** Low-medium. The column rename requires the table-recreation pattern
(see `src/main/db/CLAUDE.md` "Table Recreation — CRITICAL" — must disable FK
constraints around the rebuild or ON DELETE CASCADE fires). Pattern already
used by migration 1012.

**Explicit non-goal.** Registering extracted plan items back into the source
doc (bidirectional link). One-way breadcrumb only.

## Phase 4d — Reviewer per-criterion evaluation (GATED)

**Status: gated on 4a landing AND on an evidence-verification layer.**

Without the verification layer, this ships prettier self-certification.

### Prerequisites

1. 4a shipped — criterion-status shape exists.
2. Decision: what's the evidence layer?
   - Option i: Reviewer cites `file:line` — verify by grep-checking the file.
   - Option ii: Reviewer cites a test name — verify by running the test.
   - Option iii: Skip verification; ship structured opinion anyway.

**Recommendation: Option i + ii, with Option iii as the MVP cut if verification
tooling is a blocker.** Ship Option iii with a visible "unverified" badge so
the user knows the status is model-reported, not ground-truth-checked.

### Scope (if/when prerequisites met)

- Reviewer prompt contract: output structured JSON, each criterion →
  `{index: number, status: 'pass'|'fail'|'partial', evidence: string, kind: 'file'|'test'|'none'}`.
- Verification step (if Option i/ii): walk the JSON, check each citation.
- UI: per-criterion verdict in TaskEditModal Spec section (small badge next
  to each checkbox); detail pane shows full evidence.
- Feedback loop: if a criterion fails, user can click "send back to agent"
  with the failure context auto-populated.

**Do not ship phase 4d without 4a.** Without the status shape, there's
nowhere to land per-criterion verdicts structurally.

## Phase 4b — Canvas card spec surfacing (deferred)

**Deferred indefinitely.** Two reasons:

1. Dev-session redesign (memory: 2026-04-11) moves execution onto the board
   as the control plane. Canvas is the secondary planning view.
2. The three-file height-calc sync (`PlanCard.tsx` → `utils/planHierarchy.ts`
   → `constants/planCardStyles.ts`) is fiddly for marginal user value.

Revisit only if you start living in canvas view and feel the lack of spec
visibility there. Scope if revisited: ~half sprint.

## Cross-cutting — Prompt tuning

Not a discrete phase. Continuous concern. Trigger: evidence question #1
(Claude not populating fields).

### Levers available

1. **Strengthen `modify_plan` docstring**
   (`src/main/claude/tools/plan-changes.ts`). Current phrasing *encourages*
   intent + criteria; doesn't *require*. If evidence shows Claude skips,
   move from guidance to instruction ("For any item labeled `story`, `task`,
   or `feature`, intent MUST be set").
2. **Make `intent` Zod-required for certain labels.** Widen `CreateItemAction`
   to require `intent` when `label === 'task' | 'feature'`. This enforces at
   the tool boundary, not via prose hope.
3. **Adjust example priorities.** The tool docstring has two full examples
   (implementation + exploratory). If Claude pattern-matches on the
   exploratory example too often, tighten the example weighting.

**Measurement.** Before tuning, count: of plan items created by Claude in the
last N days, what % have non-null `intent`? `acceptance_criteria`? Tune until
>80% for implementation items.

## Invariants to preserve across all future phase-4 work

1. **Sync boundary.** Spec fields are local-only. `description` is the only
   field that crosses to Jira/Linear. See `src/main/claude/CLAUDE.md` "Sync
   boundary." If you add a spec-like field, default it to local-only.
2. **Approval flow.** All plan modifications from Claude go through
   `PlanAction[]` → user approval. User-initiated edits (TaskEditModal save)
   skip approval because the user IS the approval.
3. **Three-file sync for canvas PlanCard.** If you ever do phase 4b,
   `PlanCard.tsx` + `utils/planHierarchy.ts` + `constants/planCardStyles.ts`
   must stay in lock-step. See `src/renderer/CLAUDE.md` "Plan Card Layout &
   Height Sync."
4. **Sanitize-on-save, not on-edit.** User-visible form state tolerates empty
   rows while editing. Only trim/drop/cap when building the save payload.
   See `src/renderer/CLAUDE.md` "Plan Item Spec Fields in UI."
5. **PlanAction three-way sync.** `PlanAction` in `shared/types.ts` +
   `planActionSchema` in `ipc/validation/plan.ts` + `PlanActionService` must
   all carry any new sub-field. Includes spec sub-fields inside `create_item`
   / `update_item.updates`. See `src/main/ipc/CLAUDE.md`.
6. **Never modify deployed migrations.** Always create a new one. Enforced by
   `CLAUDE.md` at repo root.

## Quick-reference file map

Code that carries the spec-fields pattern today:

| File | Role |
|------|------|
| `src/shared/base-types.ts` | `PlanItem` interface; the four spec-adjacent fields (intent, acceptance_criteria, source_document_id, code_refs) |
| `src/shared/types.ts` | `PlanItemUpdates`, `PlanAction` union with spec sub-fields |
| `src/main/db/migrations.ts` | Migration 1073 (adds spec columns) |
| `src/main/db/repositories/impl/PlanItemRepository.ts` | JSON serialize/parse for `acceptance_criteria`; `parseStringArray` helper |
| `src/main/db/domain/PlanActionService.ts` | `executeCreateItem` writes spec fields |
| `src/main/ipc/validation/plan.ts` | Zod `planItemUpdates` + `planActionSchema` with bounds |
| `src/main/claude/tools/plan-changes.ts` | `modify_plan` tool docstring with sync-boundary rules |
| `src/main/services/repo/DevSessionService.ts` | `buildAgentContext` renders Intent + Acceptance Criteria |
| `src/main/db/domain/ExportService.ts` | Sync-boundary guard comments on `createIssue` / `updateIssue` |
| `src/renderer/components/board-view/BoardCard.tsx` | Criteria-count chip |
| `src/renderer/components/planning/hooks/usePlanTaskEdit.ts` | `handleSaveTask` passes spec fields through |
| `tests/services/buildAgentContext.test.ts` | Prompt rendering branches |
| `tests/services/PlanActionExecutor.specFields.test.ts` | End-to-end through executor |
| `tests/repositories/PlanItemRepository.test.ts` | Round-trip |

CLAUDE.md files that document conventions:

| File | Section |
|------|---------|
| `src/main/claude/CLAUDE.md` | Plan Item Spec Fields + Sync boundary |
| `src/main/ipc/CLAUDE.md` | PlanAction Schema Sync (including spec sub-fields) |
| `src/main/services/CLAUDE.md` | DevSessionService owns `buildAgentContext` |
| `src/renderer/CLAUDE.md` | Plan Item Spec Fields in UI |

## Resume checklist for future sessions

If you're picking this up fresh:

1. Read this doc (you're here).
2. Read `src/main/claude/CLAUDE.md` "Plan Item Spec Fields" and "Sync boundary."
3. Read `src/renderer/CLAUDE.md` "Plan Item Spec Fields in UI."
4. Check the observation criteria (section "What to observe before starting
   phase 4") against current app state. Ask the user which ones they've seen.
5. If evidence supports, start with phase 4a. Begin with the migration-shape
   decision (Option A above).
6. Do not skip to 4d. It's gated on 4a and on evidence-verification tooling.
7. Before ending the session, update this doc if any design decisions changed.
