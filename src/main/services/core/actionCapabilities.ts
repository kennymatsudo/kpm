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

const TOOL_CAPABILITIES_FOR_GRANT: Record<ActionCapability, readonly KpmToolCapability[]> = {
  read_project: [
    'plan_items.read',
    'plan_relations.read',
    'documents.read',
    'project_files.read',
    'plan_refs.read',
    'repo.read',
    'spill.read',
  ],
  read_integrations: ['integrations.read'],
  report_finding: [],
  write_outputs: [],
  propose_documents: ['documents.propose', 'project_context.propose'],
  propose_plan: ['plan_items.propose'],
};

export function toolCapabilitiesFor(
  grants: readonly ActionCapability[]
): KpmToolCapability[] {
  const resolved = new Set<KpmToolCapability>();
  for (const grant of grants) {
    for (const capability of TOOL_CAPABILITIES_FOR_GRANT[grant]) {
      resolved.add(capability);
    }
  }
  return [...resolved];
}
