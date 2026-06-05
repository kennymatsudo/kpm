# Claude Integration

Bridge between Electron main process and Claude via the Agent SDK. In-process MCP tools, streaming sessions, and structured plan modifications that are approval-gated by default or auto-applied when the user opts in.

## Architecture

```
StreamingSession (SDK wrapper)
    ↓
StreamingSessionService (lifecycle management)
    ↓
IPC handlers (chat.ts)
    ↓
createKpmServer() (singleton MCP server)
    ├─ plan-items.ts (query tools)
    ├─ plan-changes.ts (modification tool + callbacks)
    ├─ groups.ts (group management tools)
    ├─ jira.ts (Jira integration)
    ├─ relations.ts (dependency tools)
    ├─ storybook.ts (component discovery)
    ├─ document-update.ts (document update tools)
    ├─ document-edit.ts (document edit tools)
    ├─ claudemd-update.ts (project context updates)
    ├─ github.ts (GitHub PR description generation)
    ├─ confluence.ts (Confluence integration tools)
    ├─ briefing.ts (project briefing generation)
    ├─ file-move.ts (file move tools)
    ├─ file-delete.ts (file delete tools)
    ├─ plan-refs.ts (extract plan items from a doc; resolve @plan/<uuid> tokens)
    ↓
System prompts (prompts/ directory)
```

## Key Patterns

### 1. Streaming Sessions



- Single session carries over when switching between Plan and Workspace views
- `currentView` parameter ('plan' | 'workspace') passed for context-aware prompts
- History persists across view switches - no session reset

**Flow:**
1. `StreamingSession` wraps the SDK `query()` function
2. `AsyncMessageQueue` converts push (IPC) to pull (SDK generator)
3. Init message received → MCP servers connect → session ready
4. `send()` queues user messages; session processes asynchronously

### 2. In-Process MCP Tools

Tools are direct function calls registered with the SDK at startup—no subprocess spawning.

**Lifecycle:**
1. `createKpmServer()` called at app startup (`warmupMcpSdk()`)
2. All tool implementations collected from `tools/` directory
3. Singleton MCP server created with all tools

### 3. Plan Modification Workflow

**CRITICAL: All plan modifications MUST go through the structured PlanAction flow.**

Claude proposes changes via tools; KPM either shows the approval modal or auto-applies the actions based on the user's global setting.

```
Claude calls modification tool (modify_plan, bulk_reparent, etc.)
  ↓ Tool validates input via Zod
  ↓ Tool emits PlanAction[] via onPlanActions callback
  ↓ UI receives event
  ↓ Manual mode: approval modal → user approves → actions applied atomically
  ↓ Auto-apply mode: actions applied atomically immediately
```

**Modification tools that emit actions for approval or auto-apply:**
- `modify_plan` - General plan modifications
- `flatten_hierarchy` - Move nested items to root
- `bulk_update_status` - Update status for multiple items
- `bulk_delete` - Delete multiple items
- `bulk_reparent` - Move items under new parent
- `bulk_set_label` - Set label for multiple items
- `bulk_set_release` - Set release tag for multiple items
- `clear_dependencies` - Remove dependencies from items
- `bulk_create_groups` - Create multiple groups
- `bulk_delete_groups` - Delete multiple groups
- `assign_items_to_group` - Assign items to a group
- `clear_all_group_assignments` - Remove all group assignments

**Exception (immediate execution):**
- `clear_positions` - Only affects canvas layout, not plan structure

## Adding New Tools

1. Create tool in `tools/` directory — see `tools/plan-items.ts` for read-only example, `tools/plan-changes.ts` for modification example
2. Register in `tools/createKpmServer.ts`
3. Add usage guidance in `prompts/toolDocs.ts`
4. If the tool should be hidden in a mode or disabled state, enforce that in `permissions.ts` / `canUseTool`; do not use SDK `allowedTools` because it hides external MCP tools
5. Restart Electron (no rebuild required)

**CRITICAL:** Modification tools MUST emit `PlanAction[]` via `onPlanActions` callback — NEVER modify the database directly from a tool.

## Modifying Prompts

### System Prompts (Main Chat)

Files in `prompts/` directory. Entry point is `index.ts` with `buildSystemPrompt()`.


The `currentView` parameter ('plan' | 'workspace') adds context-aware suggestions without changing response modes — it hints at UI context, not behavior constraints.

## Common Pitfalls

### Streaming Sessions
- MCP connects once per session (tool availability fixed for session)
- 30-minute idle timeout auto-disconnects; next message auto-resumes

### Tools
- Tool names are exposed to Claude with the `mcp__kpm__` prefix
- Callbacks emit during tool execution (UI must handle mid-response updates)
- Restart required for tool changes (no hot reload)

### Prompts
- Repos added via `--add-dir`, not prompts
- Permissions rebuilt per message from `context.repos`
- Undocumented behavior = Claude guesses (add concrete examples)

### Plan Modifications
- **ALL modification tools MUST emit PlanAction[] via onPlanActions callback**
- **NEVER modify the database directly from a tool** - this bypasses review, auto-apply handling, validation, and renderer synchronization
- Actions are atomic (all succeed or all fail)
- In manual mode, user approval happens after Claude finishes responding; in auto-apply mode, the renderer executes proposals as they arrive
- If adding a new bulk modification tool, pass `onPlanActions` callback and emit actions

## File Organization

| File | Purpose |
|------|---------|
| `clientManager.ts` | Singleton Claude client |
| `contextBuilders.ts` | Context fetching for sessions |
| `sdkOptionsBuilder.ts` | SDK config construction (applies `thinking: { type: 'adaptive', display: 'summarized' }` for opus and sonnet so thinking content streams in the response) |
| `auth.ts` | API key management |
| `activity.ts` | Activity tracking |
| `findClaude.ts` | Claude binary discovery |
| `sdkTypeGuards.ts` | Type guard utilities |
| `streaming/` | Session management |
| `tools/` | MCP tool implementations |
| `tools/schemas.ts` | Shared Zod primitives (`StatusCategoryEnum`, `PlanActionsCallback`) reused across tool files |
| `tools/review-assessment.ts` | Separate read-only MCP server used by `ReviewAssessmentService` (not part of the main-chat `createKpmServer`) |
| `tools/plan-refs.ts` | `extract_plan_items_from_doc` — lift `@plan/<uuid>` tokens out of a project file by path |
| `contextRefs.ts` | `formatPlanRefSection` — expand plan refs into agent context |
| `prompts/` | System prompt builders |

## Plan References (`@plan/<uuid>`)

Descriptions, intents, and acceptance criteria may contain `@plan/<uuid>` tokens. Iteration-doc filenames and other ad-hoc references must not appear in fields that sync to external trackers, but `@plan/<uuid>` is the **sanctioned exception**: it gets rewritten to native syntax (Jira ADF, Linear ref, Confluence link, GitHub markdown) at every export boundary by `src/main/documents/planRefResolver.ts`.


## Plan Item Spec Fields

`create_item` / `update_item` carry four fields that flow from the chat iteration doc → plan item → implementation agent:

| Field | Shape | Role |
|-------|-------|------|
| `intent` | `string` (≤ 500 chars, one sentence) | Decided outcome. What "done" means at a glance. |
| `acceptance_criteria` | `string[]` (≤ 50 entries, each ≤ 1000 chars) | Testable checklist the agent must satisfy. |
| `description` | `string` (markdown) | Rationale, context, rejected alternatives. The story, not the contract. |
| `source_document_id` | `string` (no FK) | Breadcrumb to the iteration doc this item was extracted from. |

Guidance baked into the `modify_plan` tool prompt: prefer `intent` + `acceptance_criteria` for implementation items; rely on `description` alone for exploratory/research items where criteria can't be enumerated yet. `update_item.acceptance_criteria` **replaces** the full list — fetch current values first if you want to add/remove individual criteria.


### Sync boundary

KPM is the developer's local source of truth; Jira/Linear are the org's. Keep the boundary clean:

| Field | External tracker (Jira/Linear) |
|-------|--------------------------------|
| `title` | Synced as `summary` |
| `description` | Synced as description (markdown → ADF for Jira) |
| `intent` | **Local-only** — not synced |
| `acceptance_criteria` | **Local-only** — not synced |
| `source_document_id` | **Local-only** — not synced |

Enforced at `src/main/db/domain/ExportService.ts` (see the guard comments on `createIssue` / `updateIssue` payloads). Do not add spec fields to the outbound payload without an explicit product decision.

**Descriptions must stay sync-clean.** Because `description` is pushed to Jira/Linear verbatim, it must not contain references to local-only resources: KPM document IDs (`doc-...`), `source_document_id` values, or iteration-doc filenames that live only in the developer's project folder. Those references are dead outside the developer's machine. The `modify_plan` tool prompt instructs Claude to use `source_document_id` for iteration-doc breadcrumbs and never to cite them in prose — preserve that guidance when editing the tool docstring.

If you later want intent or criteria to reach external stakeholders, do it by appending them to the description payload at export time (under explicit section headers like `## Acceptance Criteria`) rather than by changing sync-direction defaults on the fields themselves. That keeps the "local by default" invariant intact.
