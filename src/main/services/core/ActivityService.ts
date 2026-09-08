/**
 * ActivityService
 *
 * Composes "what is running right now" across every project from the three
 * registries that already know: chat sessions, board agents, and terminal
 * shells. The renderer shows one project at a time, so this is what lets it
 * tell the user that another project is mid-turn or blocked on them.
 *
 * Samples on a timer and broadcasts only when the counts change, rather than
 * subscribing to three services' lifecycle events. That trade is deliberate:
 * the alternative needs a hook in every place a chat turn, agent state, or PTY
 * can transition — including the ones that don't emit an event today — and a
 * missed hook fails silently. A shallow walk of three small in-memory maps a
 * few times a second is cheaper than that risk.
 */

import type { ActivitySnapshot, ProjectActivity } from '../../../shared/ipc/activityEndpoints';
import { activityEvents } from '../../../shared/ipc/activityEvents';

export interface ActivityServiceDeps {
  /** Chat sessions mid-turn, keyed by project. */
  chatTurnsByProject: () => Map<string, number>;
  /** Board agent working / awaiting-input counts, keyed by project. */
  agentsByProject: () => Map<string, { working: number; awaitingInput: number }>;
  /** Running shells, keyed by project. */
  terminalsByProject: () => Map<string, number>;
  broadcastToWindows: (channel: string, payload: unknown) => void;
  /** Sampling interval. Defaults to 1s — fast enough to feel live, cheap enough to ignore. */
  sampleIntervalMs?: number;
}

const DEFAULT_SAMPLE_INTERVAL_MS = 1000;

/** Stable string form of a sorted snapshot, for change detection. */
function fingerprint(snapshot: ActivitySnapshot): string {
  return snapshot.map((a) => Object.values(a).join(':')).join('|');
}

export function buildSnapshot(deps: Pick<ActivityServiceDeps, 'chatTurnsByProject' | 'agentsByProject' | 'terminalsByProject'>): ActivitySnapshot {
  const chatTurns = deps.chatTurnsByProject();
  const agents = deps.agentsByProject();
  const terminals = deps.terminalsByProject();

  const projectIds = new Set([...chatTurns.keys(), ...agents.keys(), ...terminals.keys()]);
  const snapshot: ProjectActivity[] = [];

  for (const projectId of projectIds) {
    const agent = agents.get(projectId);
    snapshot.push({
      projectId,
      chatTurns: chatTurns.get(projectId) ?? 0,
      agentsWorking: agent?.working ?? 0,
      agentsAwaitingInput: agent?.awaitingInput ?? 0,
      terminals: terminals.get(projectId) ?? 0,
    });
  }

  return snapshot.sort((a, b) => a.projectId.localeCompare(b.projectId));
}

export function createActivityService(deps: ActivityServiceDeps) {
  const sampleIntervalMs = deps.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let lastFingerprint: string | null = null;

  function snapshot(): ActivitySnapshot {
    return buildSnapshot(deps);
  }

  function sample(): void {
    const next = snapshot();
    const nextFingerprint = fingerprint(next);
    if (nextFingerprint === lastFingerprint) return;
    lastFingerprint = nextFingerprint;
    deps.broadcastToWindows(activityEvents.changed.channel, next);
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(sample, sampleIntervalMs);
    // Node keeps the process alive for pending timers; this one should never be
    // the reason the app doesn't quit.
    timer.unref?.();
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { snapshot, start, stop };
}

export type ActivityService = ReturnType<typeof createActivityService>;
