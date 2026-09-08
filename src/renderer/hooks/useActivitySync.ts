import { useEffect } from 'react';
import { fetchActivitySnapshot, subscribeToActivity } from '../services/activityService';
import { useActivityStore } from '../stores/activityStore';

/**
 * Keeps the cross-project activity store fed for the app's lifetime.
 *
 * Mounted once at the app shell, not per project: its whole point is to
 * describe projects other than the open one, so a project-scoped mount would
 * defeat it. The initial fetch exists because the broadcast only fires on
 * change — without it a project that has been running since before this window
 * mounted would look idle until its next state transition.
 */
export function useActivitySync(): void {
  useEffect(() => {
    let active = true;

    void fetchActivitySnapshot()
      .then((snapshot) => {
        if (!active) return;
        useActivityStore.getState().applySnapshot(snapshot);
      })
      .catch(() => {
        // Activity is decoration; a failed fetch just means no markers.
      });

    const unsubscribe = subscribeToActivity((snapshot) => {
      useActivityStore.getState().applySnapshot(snapshot);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
