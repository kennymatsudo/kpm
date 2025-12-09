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
| `tracker_project_scopes` | Tracker project authorization (Jira/Linear) |
| `tracker_type_mappings` | Label → tracker issue type |

## IPC Pattern

```
Renderer → ipcRenderer.invoke (Zod validated) → Handler → Service → Repository → SQLite
```

## Cross-Store Communication

Use `stores/storeEvents.ts` to avoid circular deps:
```typescript
```

## RepoWatcherService

Tracks git branch changes for connected repositories in real-time.

**Files:**

**How it works:**
1. When repo connected → `watchRepo()` starts `fs.watch` on `.git/HEAD`
2. Branch change detected → debounced (100ms) → `repo:branch-changed` IPC event
3. Renderer updates `repoBranches` store → UI shows new branch

**Lifecycle:**
- `init()` called on app startup with window getter (avoids timing issues)
- Watchers created per-repo when repos are loaded/connected
- `unwatchRepo()` called when repo removed or project switched
- `unwatchAll()` called on app quit

**Gotchas:**
- macOS fires `rename` events (not `change`) when git rewrites HEAD—handle both
- Window getter pattern avoids null reference when IPC registers before window exists
- Must clean up watchers on project switch to prevent memory leaks
- Debouncing prevents rapid-fire events from some file systems

