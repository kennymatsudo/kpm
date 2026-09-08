export type WriteDecision = { allowed: true } | { allowed: false; reason: string };

type WriteGrantListener = (projectId: string, granted: boolean) => void;

/** Persistence for the grant. Injected so the grant survives restarts. */
export interface WriteGrantStore {
  listGrantedProjectIds(): string[];
  grant(projectId: string): void;
  revoke(projectId: string): void;
}

export interface ProjectWriteGrants {
  /**
   * Resolve the project's write consent, asking once if it has never been
   * answered. Concurrent callers in the same project share the one prompt.
   */
  request(
    projectId: string | undefined,
    requestConsent: () => Promise<boolean>,
  ): Promise<WriteDecision>;
  has(projectId: string | undefined): boolean;
  /** Grant without asking — the user turning writes on in settings. */
  grant(projectId: string): void;
  revoke(projectId: string): void;
  subscribe(listener: WriteGrantListener): () => void;
  /**
   * Load persisted grants. Called once at startup, before any session can run,
   * so `has()` stays a synchronous memory read on the tool-call hot path.
   */
  hydrate(store: WriteGrantStore): void;
}

const NO_PROJECT_REASON =
  'Writing needs a project to check the write grant against, and this run has none.';

export function createProjectWriteGrants(): ProjectWriteGrants {
  const grantedProjects = new Set<string>();
  const pendingRequests = new Map<string, Promise<WriteDecision>>();
  const listeners = new Set<WriteGrantListener>();
  let store: WriteGrantStore | null = null;

  const publish = (projectId: string, granted: boolean): void => {
    for (const listener of listeners) listener(projectId, granted);
  };

  const applyGrant = (projectId: string): void => {
    if (grantedProjects.has(projectId)) return;
    grantedProjects.add(projectId);
    store?.grant(projectId);
    publish(projectId, true);
  };

  return {
    hydrate(nextStore) {
      store = nextStore;
      grantedProjects.clear();
      for (const projectId of nextStore.listGrantedProjectIds()) {
        grantedProjects.add(projectId);
      }
    },

    async request(projectId, requestConsent) {
      if (!projectId) return { allowed: false, reason: NO_PROJECT_REASON };
      if (grantedProjects.has(projectId)) return { allowed: true };

      const pending = pendingRequests.get(projectId);
      if (pending) return pending;

      const request = (async (): Promise<WriteDecision> => {
        if (!await requestConsent()) {
          return {
            allowed: false,
            reason: 'The user did not allow writes in this project. Do not retry; explain what you would have changed instead.',
          };
        }

        applyGrant(projectId);
        return { allowed: true };
      })();

      pendingRequests.set(projectId, request);
      try {
        return await request;
      } finally {
        if (pendingRequests.get(projectId) === request) {
          pendingRequests.delete(projectId);
        }
      }
    },

    has(projectId) {
      return !!projectId && grantedProjects.has(projectId);
    },

    grant(projectId) {
      applyGrant(projectId);
    },

    revoke(projectId) {
      if (!grantedProjects.delete(projectId)) return;
      store?.revoke(projectId);
      publish(projectId, false);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const projectWriteGrants = createProjectWriteGrants();
