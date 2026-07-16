# KPM

![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=9FEAF9)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vibe coded](https://img.shields.io/badge/vibe%20coded-100%25-ff69b4)

KPM is a desktop app for planning and tracking software projects locally.

## Why I built it

My planning docs were a mess. Running Claude Code or Codex inside a repo left me with markdown files scattered across projects, each one referenced by path and a bad commit away from landing in the source code. A central folder didn't help. I still couldn't see a plan as a whole, and I had nowhere to lay out tickets before writing them into a tracker.

KPM keeps every plan in one place, visual and out of the repos it describes, so I can shape the work before it becomes a ticket.

## What it does

- Break a big idea into a structured plan of tasks and dependencies, and view it as a canvas, a tree, or a board.
- Keep every plan local, so nothing leaks into the repos it describes.
- Draft and rearrange tickets before you commit them to a tracker.
- Ask an AI that already sees your plan and repos, so you're not re-pasting context.
- Hand a task to an agent that works in an isolated copy of the repo. Nothing it proposes lands until you approve it.
- Open pull requests from the plan and diff, and sync back to your tracker when you choose.

## Getting started

KPM runs on macOS with Apple Silicon.

You'll need:

- **Node.js 22.19+** — the version in `.nvmrc` is the supported development runtime
- **Git** — powers worktrees, diffs, and agent runs
- **Claude Code**, installed and logged in — runs every AI feature using your existing session. No Anthropic API key required.
- **Xcode Command Line Tools** — compiles the native modules (`xcode-select --install`)

Codex, Gemini, and pi are optional extra backends. You connect them inside the app when you want them.

```bash
git clone https://github.com/kennymatsudo/kpm.git
cd kpm
make up   # installs dependencies on first run, then starts the app
```

On first launch, macOS asks to allow keychain access. That's KPM storing your tracker credentials securely. Approve it to turn on the Jira and Linear integrations.

## Documentation

| Topic             | File                                                 |
| ----------------- | ---------------------------------------------------- |
| Design principles | [`docs/core-principles.md`](docs/core-principles.md) |
| Feature catalog   | [`docs/features.md`](docs/features.md)               |
| Architecture      | [`docs/architecture.md`](docs/architecture.md)       |
| Changelog         | [`CHANGELOG.md`](CHANGELOG.md)                       |

## Contributing

KPM is Electron + React + TypeScript, with SQLite for storage and the Claude Agent SDK for AI features.

Start with [`docs/core-principles.md`](docs/core-principles.md). KPM's design rules are deliberate, and they override patterns you might infer from the code. Then run `npm run check` (typecheck + lint + tests) before opening a PR against `main`.

If you're contributing with a coding agent (Claude Code, Codex, Cursor, etc.), point it at [`AGENTS.md`](AGENTS.md) first. It maps each kind of change to the right deep-dive doc, and it lists the ideas that don't fit KPM's design so your agent doesn't try to build them: live tracker sync, multi-user features, plan files committed inside a repo.
