/**
 * Maps an action's capability grant onto the KPM tool capabilities the run is
 * allowed to reach.
 *
 * The action-level grants are the user's vocabulary ("read the project", "propose
 * document edits"); tool capabilities are the runtime's. Keeping the translation
 * here means the grant list stays legible in the UI without leaking tool-group
 * names into it.
 *
 * `report_finding` and `write_outputs` intentionally map to nothing: they are
 * delivery paths the runner performs on the run's behalf, not tools the model
 * calls.
 */

import type { ActionCapability } from '../../../shared/actions';
import type { KpmToolCapability } from '../../kpmTools/runtime';

/**
 * Keyed by tool capability so a new `KpmToolCapability` is a compile error until
 * someone decides whether action runs may reach it. `chat_only` capabilities are
 * never granted to an action:
 * - `repo.push`, `file_changes.propose`: publishing and file moves or deletes
 *   are chat requests, not something a scheduled run discovers.
 * - `board.propose`: linking a task to a worktree or PR is something the user
 *   asks for.
 * - `config.propose`: an action run must never create actions or rewrite
 *   playbooks.
 */
const ACTION_GRANT_FOR_TOOL_CAPABILITY: Record<KpmToolCapability, ActionCapability | 'chat_only'> = {
  'plan_items.read': 'read_project',
  'plan_relations.read': 'read_project',
  'documents.read': 'read_project',
  'project_files.read': 'read_project',
  'plan_refs.read': 'read_project',
  'repo.read': 'read_project',
  'spill.read': 'read_project',
  'integrations.read': 'read_integrations',
  'documents.propose': 'propose_documents',
  'project_context.propose': 'propose_documents',
  'plan_items.propose': 'propose_plan',
  'repo.push': 'chat_only',
  'file_changes.propose': 'chat_only',
  'board.propose': 'chat_only',
  'config.propose': 'chat_only',
};

/**
 * Whether a grant lets the run write through the CLI's own tools. No grant does
 * today: outputs are written by the runner and proposals go through KPM tools.
 * A grant that ever needs Edit, Write, or Bash must say so here, or the run
 * keeps them denied.
 */
const GRANT_NEEDS_BUILTIN_WRITES: Record<ActionCapability, boolean> = {
  read_project: false,
  read_integrations: false,
  report_finding: false,
  write_outputs: false,
  propose_documents: false,
  propose_plan: false,
};

const BUILTIN_WRITE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash'] as const;

/**
 * Built-in tools to deny for a run. The run uses the user's own permission mode,
 * so without this a read-only action could still edit files or run commands
 * under bypassPermissions, acceptEdits, or an allow rule. Bash is denied with
 * the writers because a shell can write anywhere; reads go through KPM tools.
 */
export function builtinToolsDeniedFor(
  grants: readonly ActionCapability[]
): string[] {
  return grants.some((grant) => GRANT_NEEDS_BUILTIN_WRITES[grant]) ? [] : [...BUILTIN_WRITE_TOOLS];
}

export function toolCapabilitiesFor(
  grants: readonly ActionCapability[]
): KpmToolCapability[] {
  const granted = new Set<ActionCapability | 'chat_only'>(grants);
  return (Object.keys(ACTION_GRANT_FOR_TOOL_CAPABILITY) as KpmToolCapability[]).filter((capability) =>
    granted.has(ACTION_GRANT_FOR_TOOL_CAPABILITY[capability])
  );
}
