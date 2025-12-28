# Claude Integration


## Architecture

```
StreamingSession (SDK wrapper)
    ↓
StreamingSessionService (lifecycle management)
    ↓
    ↓
createKpmServer() (singleton MCP server)
    ├─ plan-items.ts (query tools)
    ├─ plan-changes.ts (modification tool + callbacks)
    ├─ jira.ts (Jira integration)
    ├─ relations.ts (dependency tools)
    ↓
System prompts (prompts/ directory)
```

## Key Patterns

### 1. Streaming Sessions


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



```
  ↓ Tool validates input via Zod
  ↓ Tool emits PlanAction[] via onPlanActions callback
```


**Exception (immediate execution):**

## Adding New Tools



## Modifying Prompts

### System Prompts (Main Chat)


## Common Pitfalls

### Streaming Sessions
- MCP connects once per session (tool availability fixed for session)
- 30-minute idle timeout auto-disconnects; next message auto-resumes

### Tools
- Callbacks emit during tool execution (UI must handle mid-response updates)
- Restart required for tool changes (no hot reload)

### Prompts
- Repos added via `--add-dir`, not prompts
- Permissions rebuilt per message from `context.repos`
- Undocumented behavior = Claude guesses (add concrete examples)

### Plan Modifications
- **ALL modification tools MUST emit PlanAction[] via onPlanActions callback**
- Actions are atomic (all succeed or all fail)
- If adding a new bulk modification tool, pass `onPlanActions` callback and emit actions

## File Organization

| File | Purpose |
|------|---------|
| `clientManager.ts` | Singleton Claude client |
| `contextBuilders.ts` | Context fetching for sessions |
| `auth.ts` | API key management |
| `streaming/` | Session management |
