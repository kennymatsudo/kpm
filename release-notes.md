## New
- Add Markdown focus reader with focused document chat that persists per document
- Add scheduled loops managed from the Command+K palette, with run history and an initial check on creation
- Add workflow mode for board agents
- Add slash command typeahead in chat, covering skills and plugins
- Add targeted prompt templates to the command palette
- Add `read_spill_file` tool for recovering MCP result overflow
- Add editor action for agent worktrees
- Add adaptive Dock icon with light and dark variants
- Show active task progress and execution phases on the board, including review phase and inline commit check failures
- Show live elapsed timer on long-running tool calls
- Show queued messages above the response that answered them
- Show interrupted automation in the detail pane, with a dismiss action
- Show repo on board worktree cards
- Support batched multi-hunk document edits
- Allow chat to read any folder on disk via a read-only `git_read` tool and safe read-only pipes
- Surface model refusal messages and `credits_required` errors from the Agent SDK

## Improved
- Rework the review tab into a focused decision queue with reviewer verdict strip and inline HTML in GitHub review comments
- Reframe board sessions as discrete per-turn completions and tie board card selection to detail pane lifecycle
- Generate PR descriptions with feature context, required lead paragraph, honored templates, and final-diff priority
- Tighten and narrow chat `RESPONSE_STYLE` and board agent prompts, filtering review diff
- Polish chat reading and typing feel, render single newlines as hard breaks, and merge consecutive assistant turns into one card
- Constrain markdown preview to 70ch with 16px body
- Enable partial streaming, subagent forwarding, and auto-compact
- Keep chat sessions alive across projects and load user settings in all Claude SDK sessions
- Scope explorer subagent to multi-repo searches only
- Move Next action strip below the tab bar and replace the floating commit popover with an inline composer
- Halt board pipeline on commit-hook failures and reset automation phase after manual commit
- Complete reviewed tasks after PR merge, complete plan items on merge regardless of column, and poll merged PRs for sessions without an automation phase
- Flush queued review tasks when the addressing-review session completes
- Keep local tasks visible in people filters
- Show resolved descriptions in export review, verify tracker status after export, invalidate sync preview, and preserve board status during tracker sync
- Suppress spurious "Modified in Linear" drift on bullet markers
- Declutter board card metadata row
- Make worktree cleanup nonblocking and Codex reviews finish deterministically
- Surface loading states and silent failures in the UI
- Upgrade Claude Agent SDK and Anthropic SDK to latest

## Fixed
- Fix task commit attribution in the Changes view, including after rebase
- Fix command palette overlay not covering the chat header
- Fix board column jitter when the agent activity line appears
- Fix mermaid diagram labels, theming, scaling, and overlay scroll zoom on passive wheel listeners
- Fix resume prompt loss in chat
- Fix tool-call list duplicating at the bottom during partial streaming
- Fix task worktree actions and Codex review binary lookup
- Fix empty-state text wrapping and agent board layout shifts
- Guard plan view column against flex content overflow
- Clear review attention for closed PR threads
- Repair failed task commit checks
- Harden e2e isolation against migration data loss
- Ignore the `node_modules` symlink, not just the directory

## Removed
- Remove signed binary distribution in preparation for open source
- Stop opening DevTools by default
