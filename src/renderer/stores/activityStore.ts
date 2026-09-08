/**
 * Cross-project activity.
 *
 * Deliberately NOT project-scoped and NOT reset on a project switch: its whole
 * job is to describe the projects the user is *not* looking at, so that
 * switching away from running work doesn't make the work invisible.
 *
 * Counts only. Anything actionable arrives through `notificationStore` (things
 * that happened) or `permissionStore` (things blocking on an answer).
 */

import { create } from 'zustand';
import type { ActivitySnapshot, ProjectActivity } from '../services/activityService';

interface ActivityState {
  /** Keyed by project id. Projects with no activity are absent. */
  byProject: Record<string, ProjectActivity>;
  applySnapshot: (snapshot: ActivitySnapshot) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  byProject: {},

  applySnapshot: (snapshot) => {
    const byProject: Record<string, ProjectActivity> = {};
    for (const entry of snapshot) {
      if (!isBusy(entry)) continue;
      byProject[entry.projectId] = entry;
    }
    set({ byProject });
  },
}));

/** True when a project has any live work worth showing a marker for. */
export function isBusy(activity: ProjectActivity): boolean {
  return (
    activity.chatTurns > 0 ||
    activity.agentsWorking > 0 ||
    activity.agentsAwaitingInput > 0 ||
    activity.terminals > 0
  );
}

/** One-line description of what a project is doing, for a tooltip or menu row. */
export function describeActivity(activity: ProjectActivity): string {
  const parts: string[] = [];
  if (activity.agentsAwaitingInput > 0) parts.push(`${activity.agentsAwaitingInput} waiting on you`);
  if (activity.chatTurns > 0) parts.push(`${activity.chatTurns} chat ${activity.chatTurns === 1 ? 'turn' : 'turns'}`);
  if (activity.agentsWorking > 0) parts.push(`${activity.agentsWorking} ${activity.agentsWorking === 1 ? 'agent' : 'agents'} working`);
  if (activity.terminals > 0) parts.push(`${activity.terminals} ${activity.terminals === 1 ? 'shell' : 'shells'}`);
  return parts.join(', ');
}
