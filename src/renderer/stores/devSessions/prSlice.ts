import type { PrCreationContext } from './helpers';
import { addToSet, removeFromSet } from './helpers';
import type { DevSessionsGet, DevSessionsSet, DevSessionsState } from './index';
import {
  buildSessionPrContext,
  checkSessionGithubAuth,
  createSessionPullRequest,
  detectAndLinkSessionPr,
  generateSessionPrContent,
  getSessionPrStatus,
  linkSessionPullRequest,
} from '../../services/devSessionGithubService';

export function createDevSessionsPrSlice(
  set: DevSessionsSet,
  get: DevSessionsGet
): Pick<DevSessionsState,
  | 'updatePrStatus'
  | 'pollPrStatuses'
  | 'loadPrContext'
  | 'createPullRequest'
  | 'linkPullRequest'
> {
  return {
    updatePrStatus: (sessionId, status) =>
      set((state) => {
        const next = new Map(state.prStatusCache);
        next.set(sessionId, status);
        return { prStatusCache: next };
      }),

    pollPrStatuses: async () => {
      const { sessions, projectId } = get();

      const sessionsWithOpenPr = sessions.filter(
        (session) => session.pr_number != null && session.pr_state !== 'MERGED' && session.pr_state !== 'CLOSED'
      );

      let anyStatusChanged = false;
      for (const session of sessionsWithOpenPr) {
        try {
          const result = await getSessionPrStatus(session.id);
          if (result.success && result.status) {
            get().updatePrStatus(session.id, result.status);
            if (
              result.status.state !== session.pr_state ||
              result.status.reviewDecision !== session.review_state
            ) {
              anyStatusChanged = true;
            }
          }
        } catch {
          // Silently skip failures during polling
        }
      }

      const sessionsWithoutPr = sessions.filter((session) => session.pr_number == null);
      let anyLinked = false;
      for (const session of sessionsWithoutPr) {
        try {
          const result = await detectAndLinkSessionPr(session.id);
          if (result.success && result.status) {
            get().updatePrStatus(session.id, result.status);
            anyLinked = true;
          }
        } catch {
          // Silently skip failures during auto-detection
        }
      }

      if ((anyStatusChanged || anyLinked) && projectId) {
        await get().loadSessions(projectId);
      }
    },

    loadPrContext: async (sessionId, options) => {
      const force = options?.force ?? false;
      const featureContextPath = options?.featureContextPath ?? null;
      const cachedContext = get().prContextBySessionId.get(sessionId);
      if (!force && cachedContext && (cachedContext.featureContextPath ?? null) === featureContextPath) {
        return { success: true, context: cachedContext };
      }

      set((state) => ({
        prContextLoadingIds: addToSet(state.prContextLoadingIds, sessionId),
      }));

      try {
        const authResult = await checkSessionGithubAuth(sessionId);
        if (!authResult.success || !authResult.authenticated) {
          return {
            success: false,
            error: authResult.error || 'GitHub CLI not authenticated. Run `gh auth login` in your terminal.',
          };
        }

        const contextResult = await buildSessionPrContext(sessionId);
        if (!contextResult.success) {
          return {
            success: false,
            error: contextResult.error || 'Failed to load PR context',
          };
        }

        const rawTitle = contextResult.suggestedTitle || '';
        const rawBody = contextResult.body || '';
        const prTemplate = contextResult.prTemplate ?? null;
        const hasCommits = contextResult.hasCommits ?? true;

        let context: PrCreationContext = {
          suggestedTitle: rawTitle,
          body: rawBody,
          branch: contextResult.branch ?? undefined,
          baseBranch: contextResult.baseBranch ?? undefined,
          hasCommits,
          prTemplate,
          aiGenerated: false,
          featureContextPath,
        };

        set((state) => {
          const next = new Map(state.prContextBySessionId);
          next.set(sessionId, context);
          return { prContextBySessionId: next };
        });

        if (hasCommits) {
          try {
            const aiResult = await generateSessionPrContent(sessionId, rawTitle, rawBody, prTemplate, '', '', featureContextPath);
            if (aiResult.success && aiResult.title && aiResult.body) {
              context = {
                ...context,
                suggestedTitle: aiResult.title,
                body: aiResult.body,
                aiGenerated: true,
              };
              set((state) => {
                const next = new Map(state.prContextBySessionId);
                next.set(sessionId, context);
                return { prContextBySessionId: next };
              });
            }
          } catch {
            // AI generation failed silently; raw context is already set.
          }
        }

        return { success: true, context };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load PR context',
        };
      } finally {
        set((state) => ({
          prContextLoadingIds: removeFromSet(state.prContextLoadingIds, sessionId),
        }));
      }
    },

    createPullRequest: async (sessionId, title, body, draft) => {
      try {
        const result = await createSessionPullRequest(sessionId, title, body, draft);
        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to create pull request',
          };
        }

        const projectId = get().projectId;
        if (projectId) {
          await get().loadSessions(projectId);
        }

        return {
          success: true,
          number: result.number,
          url: result.url,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create pull request',
        };
      }
    },

    linkPullRequest: async (sessionId, prIdentifier) => {
      try {
        const result = await linkSessionPullRequest(sessionId, prIdentifier);
        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to link PR',
          };
        }

        const projectId = get().projectId;
        if (projectId) {
          await get().loadSessions(projectId);
        }

        return {
          success: true,
          number: result.number,
          url: result.url,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to link PR',
        };
      }
    },
  };
}
