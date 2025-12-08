# Architecture

## Process Boundaries

| Process | Restart |
|---------|---------|
| Electron App | Quit and reopen |

## Directory Structure

```
src/
├── main/                    # Electron main process
│   ├── ipc/                 # IPC handlers
│   ├── claude/              # Claude SDK integration
├── renderer/                # React frontend
│   ├── components/
│   └── constants/
```

## Domain Model

**Hierarchy:** project → feature → task


**Tracker linking:** Connection → Scope → Association (JQL filter)

## Database Tables

| Table | Purpose |
|-------|---------|
| `attachments` | Uploaded files |
| `plan_relations` | Dependencies (depends_on, blocks, relates_to) |

## IPC Pattern

```
Renderer → ipcRenderer.invoke (Zod validated) → Handler → Service → Repository → SQLite
```

## Cross-Store Communication

Use `stores/storeEvents.ts` to avoid circular deps:
```typescript
```

