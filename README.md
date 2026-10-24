# KPM

When you do most of your work through coding agents across several repos, the work around the agents falls behind. You re-explain the project at the start of every chat. Design docs live in whichever repo you happened to be in, and a week later they no longer match the code. A PR merges and its ticket still says in progress. With two agents running at once, you lose track of which worktree has which change.

KPM is a Mac app that keeps your plans, tasks, pull requests, and tickets in one place, and runs Claude Code, Codex, and pi against them with your own settings. It is built for one person working across several repos. If you work in one repo and don't use a tracker, Claude Code or Codex in a terminal is simpler.

## What KPM does

- Starts every chat from your plans, your tasks, and every repo the project touches. Old chats pick up where they left off.
- Keeps plans in a project folder outside your repos, so they can't be committed by accident. Ask chat to check a doc against the code, and review its edits as a diff.
- Links each task to its Jira or Linear ticket and its PR. When the code changes, chat proposes ticket updates and you push them together. Nothing syncs until you ask.
- Runs each task in its own git worktree, so agents never touch your branch. You choose the steps, for example one agent writes the code, another reviews it, and the first fixes what the review found.
- Watches your open PRs and collects new reviews, failing checks, and merges in one feed. It flags which review comments are worth acting on.
- Runs saved prompts on a timer, like "check Slack and GitHub for news on this project."

The full list is in [`docs/features.md`](docs/features.md).

## Install

You'll need:

- A Mac with Apple Silicon
- Node.js 22.19 or later, below 23. See `.nvmrc`.
- Git
- Claude Code, installed and logged in. KPM uses your session, so you don't need an Anthropic API key.
- Xcode Command Line Tools: `xcode-select --install`
- Optional: Codex, pi, or the Gemini CLI

```bash
git clone https://github.com/kennymatsudo/kpm.git
cd kpm
make up      # install and run in dev mode
make app     # build and install to /Applications
```

Update with `git pull && make app`. On first launch, KPM asks for keychain access to store your tracker credentials.

## Contributing

KPM is Electron, React, TypeScript, and SQLite, with the Claude Agent SDK, Codex SDK, and pi for AI features. Read [`docs/core-principles.md`](docs/core-principles.md) first. If you work with a coding agent, point it at [`AGENTS.md`](AGENTS.md). Run `npm run check` before opening a PR against `main`.

Releases are SemVer tags on `main`, made with `make release:patch`, `make release:minor`, or `make release:major`. [`CONTEXT.md`](CONTEXT.md) defines the domain terms, and [`CHANGELOG.md`](CHANGELOG.md) lists what each release changed.

## License

[MIT](LICENSE)
