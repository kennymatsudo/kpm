# IPC Handlers

Bridges Electron's main process and renderer. Pattern: validate with Zod → delegate to services → return response.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer Process (React)                     │
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
├── response.ts           # IpcResponse type and helpers
├── validation.ts         # Re-export from validation/
├── validation/           # Zod schemas by domain
│   ├── index.ts
│   ├── shared.ts
│   ├── utils.ts          # createIpcHandler helper
│   └── [domain].ts       # Domain-specific schemas
```

## Channel Registry


```typescript
export const IPC_CHANNELS = {
  project: { create: 'project:create', get: 'project:get', list: 'project:list' },
  plan: { updateItem: 'plan:update-item', listItems: 'plan:list-items' },
} as const;
```

## Handler Pattern: Validate → Delegate → Return

### Pattern 1: Service with Result Type

```typescript

  // Data-returning handlers: use unwrapOrThrow (throws on error, returns data directly)
  });

  // Void/action handlers: use toIpcResponse (returns { success, data?, error? })
  });
}
```

### Pattern 2: createIpcHandler Wrapper

```typescript
ipcMain.handle(
  createIpcHandler(
    },
  )
);
```

## Validation Schemas

Schemas in `validation/` organized by domain (one file per domain). See `validation/plan.ts` for an example.

## Response Patterns

| Handler Type | Use | Example |
|--------------|-----|---------|
| Returns data | `unwrapOrThrow()` | `list`, `get`, `create` |
| Returns void/action result | `toIpcResponse()` | `delete`, `update`, `remove` |

## Adding a New IPC Handler

2. Create Zod schema in `validation/{domain}.ts`

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

**Failure to sync causes:** `ZodError: Invalid input` with "No matching discriminator" when Claude tools emit actions.
