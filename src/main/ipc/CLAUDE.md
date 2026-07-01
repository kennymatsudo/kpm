# IPC Handlers

Bridges Electron's main process and renderer. Pattern: validate with Zod → delegate to services → return response.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer Process (React)                     │
│         window.api.<domain>.<method>(params) (src/preload)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ IPC Channel Bridge
┌──────────────────────────▼──────────────────────────────────────┐
│                    Main Process (Electron)                       │
│  Handler (Zod validation) → Service (business logic) → Response │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/main/ipc/
├── index.ts              # Handler registration (composition root)
├── channels.ts           # Re-export of shared channel constants
├── response.ts           # IpcResponse type and helpers
├── validation.ts         # Re-export from validation/
├── validation/           # Zod schemas by domain
│   ├── index.ts
│   ├── shared.ts
│   ├── utils.ts          # createIpcHandler helper
│   └── [domain].ts       # Domain-specific schemas
├── handlers/             # IPC handler implementations (one per domain)
└── register/             # Handler registration groups (three files, called from index.ts)
    ├── workspace.ts      # Project/repo/attachment, plan/group, chat, files/export, tracker, settings, themes, permissions, artifacts, task prompt templates, custom prompts, scheduled loops, onboarding, slack
    ├── development.ts    # Worktree, GitHub, review, dev sessions, file explorer, repo files, agent sessions
    └── platform.ts       # Shell, terminal, temp images, perf, confluence, debug, testing, tool log, prompt overrides, search, briefing, MCP servers, usage handlers
```

## Channel Registry

All channels are defined in `src/shared/ipcChannels.ts` and re-exported from `channels.ts` for main-process handlers:

```typescript
export const IPC_CHANNELS = {
  project: { create: 'project:create', get: 'project:get', list: 'project:list' },
  plan: { updateItem: 'plan:update-item', listItems: 'plan:list-items' },
} as const;
```

## Handler Pattern: Validate → Delegate → Return

### Pattern 1: Service with Result Type

```typescript
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';
import { WorktreeSchemas } from '../validation';

export function registerWorktreeHandlers(worktreeService: WorktreeService): void {
  // Data-returning handlers: use unwrapOrThrow (throws on error, returns data directly)
  ipcMain.handle(IPC_CHANNELS.worktree.getStatus, async (_event, params: unknown) => {
    const { worktreeId } = WorktreeSchemas.getStatus.parse(params);
    return unwrapOrThrow(await worktreeService.getStatus(worktreeId));
  });

  // Void/action handlers: use toIpcResponse (returns { success, data?, error? })
  ipcMain.handle(IPC_CHANNELS.worktree.delete, async (_event, params: unknown) => {
    const { worktreeId, force } = WorktreeSchemas.delete.parse(params);
    return toIpcResponse(await worktreeService.deleteWorktree(worktreeId, force));
  });
}
```

See `handlers/worktree.ts` for the full file.

### Pattern 2: createIpcHandler Wrapper

```typescript
ipcMain.handle(
  IPC_CHANNELS.artifact.list,
  createIpcHandler(
    ArtifactSchemas.list,  // Zod schema
    async ({ projectId }) => {
      const result = artifactService.list(projectId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to list artifacts'
  )
);
```

Most handlers use this wrapper (see `handlers/artifacts.ts`, `handlers/plan.ts`). For parameter-less handlers, `createSimpleIpcHandler` skips the Zod step.

## Validation Schemas

Schemas in `validation/` organized by domain (one file per domain). See `validation/plan.ts` for an example.

## Response Patterns

| Handler Type | Use | Example |
|--------------|-----|---------|
| Returns data | `unwrapOrThrow()` | `list`, `get`, `create` |
| Returns void/action result | `toIpcResponse()` | `delete`, `update`, `remove` |

## Adding a New IPC Handler

1. Define channel in `src/shared/ipcChannels.ts`
2. Create Zod schema in `validation/{domain}.ts`
3. Create handler in `handlers/{domain}.ts` — prefer `createIpcHandler` (Pattern 2; see `handlers/plan.ts`, `handlers/artifacts.ts`) for new handlers; the raw `ipcMain.handle` + `unwrapOrThrow`/`toIpcResponse` form (Pattern 1; see `handlers/worktree.ts`) also appears in the codebase but adds no benefit over Pattern 2
4. Import and call the handler in the appropriate `register/` file (`workspace.ts`, `development.ts`, or `platform.ts`); `index.ts` calls each register file's function, so adding to the right group is enough

## Best Practices

1. **Always validate** — Use Zod schemas; never trust renderer input
2. **Delegate to services** — Handlers validate + delegate; no business logic
3. **Use result types** — `ServiceResult<T>` makes errors explicit
4. **Organize by domain** — One handler file per feature
5. **Return objects** — IPC serializes easily; return `{ data: T }`

## Critical: PlanAction Schema Sync

**IMPORTANT:** The `planActionSchema` in `validation/plan.ts` MUST stay in sync with the `PlanAction` type in `shared/types.ts`.

When adding a new action type:
1. Add to `PlanAction` union type in `shared/types.ts`
2. Add matching Zod schema in `validation/plan.ts` → `planActionSchema`
3. Add handler case in `db/domain/PlanActionService.ts`

Current action types that MUST be in both places:
- Plan items: `create_item`, `reparent`, `set_label`, `set_release`, `update_item`, `delete_item`, `set_position`, `reorder`
- Dependencies: `add_dependency`, `remove_dependency`
- Groups: `create_group`, `update_group`, `delete_group`, `assign_to_group`
- Tracker: `queue_for_tracker`

Spec sub-fields inside `create_item` / `update_item.updates` (`intent`, `acceptance_criteria`, `source_document_id`) must also match between `shared/types.ts`, `planActionSchema`, and `PlanActionService`. The DB column is added via migration (see `src/main/db/CLAUDE.md`) — schema updates without a migration will silently drop the values.

**Failure to sync causes:** `ZodError: Invalid input` with "No matching discriminator" when Claude tools emit actions.
