import type { ActivitySnapshot } from '../../shared/ipc/activityEndpoints';

export type { ActivitySnapshot, ProjectActivity } from '../../shared/ipc/activityEndpoints';

export function fetchActivitySnapshot(): Promise<ActivitySnapshot> {
  return window.api.activity.snapshot();
}

export function subscribeToActivity(callback: (snapshot: ActivitySnapshot) => void): () => void {
  return window.api.activity.onChanged(callback);
}
