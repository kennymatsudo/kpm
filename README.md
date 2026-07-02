# KPM

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=9FEAF9)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vibe coded](https://img.shields.io/badge/vibe%20coded-100%25-ff69b4)

KPM is a desktop app for planning your work and building it with AI, without losing context every time you switch between the two.

Jira and Linear are still where your team tracks work. KPM is where you actually figure out how to do it.

## Why

Real work rarely fits in a single ticket. "Add user auth" is one line in Jira, but you know it's really a dozen smaller tasks spread across a few repos, some of which depend on each other. Working that out usually means bouncing between a tracker that's too coarse, docs that go stale, and a chat window that forgets everything the moment you close it.

KPM keeps it all in one place: you break the work down, talk it through with AI that already knows your plan and your code, and hand pieces off to an agent to build — without starting from zero at each step.

## What it does

- **Break work down your way.** Turn a big idea into a plan with real structure — tasks, dependencies, whatever hierarchy makes sense — and view it as a canvas, a tree, or a board.
- **Chat with full context.** Ask questions or think out loud with an AI that can see your plan and your repos at the same time, so you don't have to re-explain yourself.
- **Let an agent build it.** Hand a task to an agent and it works in its own isolated copy of the repo — implementing, reviewing its own work, and stopping for you before anything ships.
- **Nothing happens without you.** Every change an AI proposes — to your plan, your docs, a PR reply — waits for your say-so, unless you've turned on auto-apply.
- **Ship and sync when you're ready.** Open and describe pull requests from your actual plan and diff, and push updates back to Jira or Linear only when you choose to.

It's built for one person, not a team — your own cockpit, not shared software. And there's no separate AI subscription to manage: it runs on your existing Claude Code login.

## Getting started

**From source**

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

KPM is Electron + React + TypeScript, with SQLite for storage and the Claude Agent SDK for AI features.

Start with [`docs/core-principles.md`](docs/core-principles.md) — KPM's design rules are deliberate and override patterns you might infer from the code. Then run `npm run check` (typecheck + lint + tests) before opening a PR against `main`.

If you're contributing with a coding agent (Claude Code, Codex, Cursor, etc.), point it at [`AGENTS.md`](AGENTS.md) first. It maps each kind of change to the right deep-dive doc and lists the ideas that don't fit KPM's design — live tracker sync, multi-user features, plan files inside repos — so your agent doesn't build them.

## License

[MIT](LICENSE)
