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



| Handler Type | Use | Example |
|--------------|-----|---------|
| Returns data | `unwrapOrThrow()` | `list`, `get`, `create` |
| Returns void/action result | `toIpcResponse()` | `delete`, `update`, `remove` |

## Adding a New IPC Handler


## Best Practices

1. **Always validate** — Use Zod schemas; never trust renderer input
2. **Delegate to services** — Handlers validate + delegate; no business logic
3. **Use result types** — `ServiceResult<T>` makes errors explicit
4. **Organize by domain** — One handler file per feature
5. **Return objects** — IPC serializes easily; return `{ data: T }`
