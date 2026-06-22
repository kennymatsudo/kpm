# KPM

**A codebase-aware planning workbench for developers.** KPM is a local desktop cockpit where you plan, explore, and ship work across any number of repos — with AI grounded in your actual plan and code at every step.

Jira and Linear stay the team's source of truth. KPM is yours.

## Why KPM

Developer work doesn't fit in a tracker. "Add user auth" is one Jira ticket, but you know it's eight tasks with dependencies across three repos. Breaking that down today means choosing between planning files that pollute your repos, docs that drift away from the code, and AI chats that start cold every time.

KPM keeps the whole loop in one place, so context never resets between phases:

```
Discovery  →  explore repos, research, and triage with Claude
Planning   →  break work into a hierarchy with dependencies
Execution  →  run coding agents per task in isolated worktrees
Artifacts  →  weekly updates, PR descriptions, test plans
```

## What it does

- **Plan the way you think.** Hierarchical breakdown (project → feature → task) with dependencies, on a freeform canvas, tree, or kanban board. Plans live in a local SQLite database — never as files committed to your repos.
- **Chat grounded in your project.** Claude works with your plan, documents, and connected repos always in scope — across every repo at once, read-only by default. Built for codebase exploration, investigation, and turning findings directly into plan items.
- **Agentic execution with guardrails.** Start an agent on any plan item: it gets an isolated git worktree, the task's intent and acceptance criteria, and a structured lifecycle — implement, opposing-agent review, one addressing pass, then human review. Claude and Codex backends are interchangeable.
- **You stay in control.** Every AI-proposed change — plan edits, document updates, review replies — is queued for your approval before anything is written. Opt into auto-apply when you want speed over review.
- **Full PR workflow.** Create and link GitHub PRs, generate descriptions from the diff and plan context, turn review threads into tasks, and let the agent draft replies.
- **Sync with Jira and Linear on your terms.** Import issues, export plan items, map types and statuses, and resolve conflicts with three-way detection. No live feeds, no push-driven surprises.
- **Communicate outward without busywork.** Generate weekly updates, test plans, and briefings from your real plan state and git history.

KPM is single-user by design — it's your cockpit, not a team tool. And there's no API key to manage: it uses your existing Claude Code session.

## Getting started

You'll need:

- **Node.js 20+**
- **Claude Code** — installed and logged in (powers all AI features)
- **Git** — worktrees, diffs, and agent execution
- **Codex authentication** *(optional)* — enables Codex-backed agent sessions
- **Xcode Command Line Tools** *(macOS)* — native module compilation (`xcode-select --install`)

```bash
git clone https://github.com/kennymatsudo/kpm.git
cd kpm
make install   # installs deps and rebuilds native modules for Electron
make dev       # start the app
```

On first launch, macOS asks to allow keychain access — that's KPM storing tracker credentials securely. Approve it to enable Jira/Linear integrations.

## Documentation

| Topic | File |
|-------|------|
| Design principles | [`docs/core-principles.md`](docs/core-principles.md) |
| Feature catalog | [`docs/features.md`](docs/features.md) |
| Architecture | [`docs/architecture.md`](docs/architecture.md) |
| Development commands | [`CLAUDE.md`](CLAUDE.md#commands) |
| Release notes | [`CHANGELOG.md`](CHANGELOG.md) |

## Contributing

KPM is Electron + React 19 + TypeScript, with SQLite for storage and the Claude Agent SDK for AI integration.

Start with [`docs/core-principles.md`](docs/core-principles.md) — KPM's design rules are deliberate and override patterns you might infer from the code. Then run `npm run check` (typecheck + lint + tests) before opening a PR against `main`.

If you're contributing with a coding agent (Claude Code, Codex, Cursor, etc.), point it at [`AGENTS.md`](AGENTS.md) first. It maps each kind of change to the right deep-dive doc and lists the proposals that violate KPM's design — live tracker sync, multi-user features, plan files inside repos — so your agent doesn't build them.

## License

[MIT](LICENSE)
