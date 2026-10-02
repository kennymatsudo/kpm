/**
 * MCP tool documentation for system prompts.
 *
 * Design principle: Decision tree over exhaustive docs.
 * Tools are self-documenting via MCP; the system prompt guides when to use them.
 * Detailed action schemas live in tool descriptions, not here.
 */

/**
 * Tool decision tree - compact routing guide.
 */
export function buildToolDecisionTree(): string {
  return `## Tools

- **Code facts:** use Grep/Glob/Read on connected repos, not plan query tools. Reach for the \`explorer\` subagent via the Agent tool only for broad searches spanning multiple repos simultaneously — not for reading project files, documents, or symbols within a single repo.
- **Git state:** read git freely. \`git_read\` and read-only \`git\` in Bash (status, log, diff, show, blame, branch listing, \`merge-base\`) both run without write access.
- **GitHub:** use these tools rather than \`gh\` in Bash, which the user's sandbox settings may cut off from GitHub (so a failing \`gh\` never means you lack access). No PR number: \`find_pull_requests\` by branch, author (\`@me\`), state, or search text; never scan PR numbers or match commits against PR heads. Read: \`read_pull_request\` takes a URL, \`#123\`, or a number in any repo; set \`includeDiff: true\` only when the question is about the code, \`includeReviews: true\` for reviews, review threads, and discussion comments, and \`includeChecks: true\` for CI status and merge readiness. Open or edit: push with \`git_push\`, then \`create_pull_request\` (draft by default) or \`update_pull_request\`; both need the project's publishing grant, so never hand the user a \`gh\` command without trying them first. \`git_read\` runs unsandboxed for a remote ref (\`fetch origin pull/123/head\`).
- **Publishing a branch:** \`git_push\` pushes the checked-out branch of a connected repo (needs the project's publishing grant, refuses protected and default branches). \`git push\` in Bash may not reach the network or your credentials, so never suggest the user run one for you without trying this first.
- **Agent config files:** Bash may be blocked from writing under a repo's \`.claude/\` (skills, commands, agents, hooks), including through symlinks such as \`.agents/skills\`. Change those files with Edit or Write.
- **Plan facts:** use plan query tools only when the user asks about items, structure, status, blockers, or tracker links. Prefer \`get_plan_items\` for multiple IDs.
- **Project files:** use \`read_project_file\`, \`list_project_files\`, \`propose_document_create\`, and \`propose_document_edit\` for KPM project documents. When no specific file is given, list with \`recursive: true\` and use each file's \`summary\` to pick which documents to open before reading them in full; a missing \`summary\` means not-yet-indexed, not irrelevant, so read it when in doubt.
- **KPM changes:** propose changes with the appropriate change tool. Use \`modify_plan\` for plan mutations, \`propose_context_edit\` for the project context file, and document proposal tools for project files. For an existing item's title/description/intent/criteria, fetch the full item and use \`revise_work_brief\` with its current revision; use \`set_repo_targets\` for the separate Repository Scope.
- **KPM configuration:** when asked to create or change an execution playbook, call \`read_config\` first for the current steps, version, providers, prompt keys, and step grammar, then \`propose_config_change\` with the complete playbook. It always waits for the user's review, even with auto-apply on. Write step instructions as prompt text, never as a skill.
- **Work started outside KPM:** when the user says a task's work lives in a branch, worktree, or pull request KPM did not start, use \`propose_board_change\` (\`attach_worktree\` or \`link_pr\`); \`list_worktrees\` shows which worktrees can be attached. It follows the user's review setting like plan changes.
- **Deletion:** \`delete_project_file\` proposes deletion; use only when explicitly asked.
- **External systems:** when the user references Slack, GitHub, Linear, or similar systems and tools are available, use those tools and report what you found.
- **Efficiency:** issue independent reads in parallel and gather enough evidence before answering or acting.`;
}
