

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

  });

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



## Adding a New IPC Handler


## Best Practices

1. **Always validate** — Use Zod schemas; never trust renderer input
2. **Delegate to services** — Handlers validate + delegate; no business logic
3. **Use result types** — `ServiceResult<T>` makes errors explicit
4. **Organize by domain** — One handler file per feature
5. **Return objects** — IPC serializes easily; return `{ data: T }`
