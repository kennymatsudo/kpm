# Brief: authoring KPM configuration from chat

Status: first iteration (playbooks) built. Actions, prompts, and the Settings entry point are not.

## Goal

Let the user ask KPM chat to create or change KPM's own configuration, starting with execution playbooks and later covering actions and prompts. The target request for the first iteration:

> Create a playbook that implements, runs the review loop until nothing is left to address, then simplifies anything overengineered or built on assumptions, then cleans up names, then prunes comments.

Chat drafts the playbook, KPM validates it, and the user approves a diff before anything is saved.

## Principle amendment (P8)

P8 covers plan mutations today. Configuration needs a stricter rule, because a playbook decides which agents run and whether they may write, and an action can run unattended on a timer. If chat could auto-apply these, text planted in a document or ticket could install behavior that keeps running after the chat ends.

Amend `docs/core-principles.md` section 8 with:

> Configuration changes proposed by chat (playbooks, actions, prompts) always require review. The global auto-apply setting does not cover them.

Add the same rule to the skim-summary row for P8.

## Design

### One registry, many config kinds

A `CONFIG_KIND_REGISTRY` in `src/shared/configKinds.ts` maps each kind to:

- its schema and validator (for playbooks: `playbookSchema` and `getPlaybookValidationIssues` in `src/shared/playbooks.ts`)
- a reader that returns the current records
- an apply function that calls the existing service (for playbooks: the `playbook:create` / `playbook:update` endpoints, which already exist, so no new IPC is needed to apply)
- a diff presenter for the approval panel

The first iteration registers only `playbook`. Adding `action` later is one entry backed by `actionEditableSchema` and `getActionValidationIssues`. Prompts come after that (see Future kinds). This follows the `PLAN_ACTION_REGISTRY` pattern.

### Tools

A new tool group, `kpm-config`, in `src/main/kpmTools/tools/config.ts`:

- `read_config(kind, id?)` lists or fetches records of a kind. For playbooks it also returns what a step can reference: board providers and their models (from `boardProviderRegistry`), prompt keys with a one-line description each, and the step grammar (routing fields, loop rules). Each record carries a version token (a hash of its stored definition) for the stale check below. Full prompt text is not included; `read_config('prompt', key)` returns one prompt's text when chat needs to build on it (prompts are readable in the first iteration but cannot be proposed yet). This keeps the listing small, since chat may call it several times per turn.
- `propose_config_change(kind, op, payload, baseVersion?)` where `op` is `create` or `update`. The tool runs the kind's validator before emitting anything. Issues go back to the model as the tool result, so it can fix them in the same turn and the user only sees valid proposals. A valid proposal is emitted through the proposal sink.

There is no `delete` op in the first iteration. Deleting stays a Settings action.

### Where the tools appear

- Chat only: the group is available in the `main` chat scope, not in `focus_document`.
- The group gets a new capability, `config.propose`, that is deliberately left out of `TOOL_CAPABILITIES_FOR_GRANT` in `src/main/services/core/actionCapabilities.ts`. Action runs can then never reach it, so an action cannot create actions or rewrite playbooks.
- Board agents never get KPM tools, so a playbook step cannot rewrite playbooks.

### Disposal

A new `ProposedChange` variant, `type: 'config'`, in `src/renderer/stores/proposedChangeDisposal.ts`, with `defaultPolicy: 'review_required'`. This policy already exists (review replies use it), so config proposals queue for review even when auto-apply is on. No new switch is needed.

The approval panel shows a step-level diff: added, removed, and changed steps, plus routing changes (`next`, `onFindings`), shown as a readable list rather than raw JSON. Prompt text inside a step shows as a normal text diff.

The panel offers approve or reject only (`presentation.editable: false`). To change a proposal, the user rejects it or asks for changes in chat, and chat sends a corrected proposal. Inline editing would mean rebuilding the playbook editor inside the approval panel.

Stale check at apply time: if the stored playbook's version no longer matches `baseVersion`, apply fails with "changed since proposed" instead of overwriting the user's edit.

Proposals are tied to the chat's project, like every other proposal, but playbooks are global. That is acceptable. Approving from any project changes the same global playbook, and the panel should say so ("applies to all projects").

### Behavior it inherits

- Updating a built-in playbook saves a customized copy, as `PlaybookService.update` already does, so reset still works.
- Runs keep an immutable snapshot of their playbook, so approving a change mid-run does not affect runs already in flight.

## Step content: prompts only

New playbooks written by chat use only `directive: { kind: 'prompt', text }` (or a `promptKey`). The `skill` directive stays loadable so existing saved playbooks still run, but the chat tool never emits it and the editor stops offering it.

Why skills are out:

- KPM looks for skill files only in `~/.claude/skills`. Codex users keep skills elsewhere, so a skill they can see would show up as missing in KPM.
- Claude loads a whole skill folder. Codex and pi get only the SKILL.md text, so skills with supporting files behave differently by provider.
- A skill is read from disk when the step starts, which breaks the promise that a run follows the snapshot it started with.

A user who wants a skill's behavior pastes its text into the step prompt. Adapting that text (removing frontmatter, removing lines that wait for a person) is the user's responsibility. KPM validates the playbook's structure and routing, never the prompt text. Chat can read a skill file when asked, since chat reads are ungated, and put its text in a proposal as written.

## Worked example

The target playbook fits the current step grammar with no runtime changes. `advancePlaybook` in `src/shared/playbookRuntime.ts` sends every exit from the review loop (no findings, a pass that clears everything, max passes with `proceed`) to `review.next`.

| Step | Session | Directive | Routing |
|---|---|---|---|
| `implement` | main | implementation prompt | |
| `review` | subagent | review prompt, `verdict: findings` | `onFindings: { goto: address, maxPasses: 3, onMaxPasses: pause, onStall: pause }`, `next: simplify_review` |
| `address` | main | `agents.review_assessment` | `next: review` |
| `simplify_review` | subagent | inline overengineering and assumptions prompt, `verdict: findings` | `onFindings: { goto: simplify_address, maxPasses: 1, onMaxPasses: proceed }`, `next: rename` |
| `simplify_address` | main | apply the simplification findings | `next: rename` |
| `rename` | main | pasted naming prompt | |
| `prune` | main | pasted comment prompt | |

Notes:

- `simplify_address` has to be its own step. Pointing `simplify_review` at `address` would send the run back into the main review loop.
- The simplification check runs as a subagent, a separate reviewer, because the implementer is the worst judge of its own assumptions. Its prompt should compare the diff with the Work Brief's intent and acceptance criteria.
- Order is simplify, then rename, then prune. Renaming code that is about to be deleted wastes a pass, and comments refer to names.

This example is the acceptance test for the first iteration: chat produces this playbook from the request above, it passes validation, the diff reads clearly, and the approved playbook runs end to end on a board item.

## Future kinds

- Actions: register `action` with its existing schema. It is higher risk than playbooks because of triggers and capability grants, so the diff presenter must surface trigger changes and newly granted capabilities first.
- Prompts: today a step can point only at built-in prompt keys or carry inline text. A `prompt` kind would let chat save a named prompt that several playbooks share, which is the natural place to move long inline step prompts.
- Entry points: a "Draft with chat" button in Settings, Playbooks (and later Actions) that opens a chat with the selected record attached.

## Build order

1. P8 amendment in `docs/core-principles.md` and the invariant line in `CLAUDE.md`.
2. `src/shared/configKinds.ts` with the playbook entry, plus a version-token helper.
3. `kpm-config` tool group, `config.propose` capability, tool docs in `prompts/toolDocs.ts`.
4. `config` proposal variant, adapter, and `PendingConfigPanel` with the step diff.
5. Remove `skill` from the playbook editor's directive picker (loading stays).
6. Tests: validator issues reach the model; the tool is unreachable from action runs; auto-apply still queues config proposals; the stale check rejects; the worked example routes correctly through `advancePlaybook`.
7. `docs/features.md` entry under Execution playbooks.
