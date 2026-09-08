import { describeGhAuth } from '../../../shared/ghAuth';
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

// gh reports a rejected credential as "Bad credentials" / "HTTP 401" (REST and
// GraphQL alike) and git as "Authentication failed". Matched as whole phrases
// because the error text embeds the gh command line, PR body included, where a
// bare "401" could show up innocently.
const CREDENTIAL_REJECTION = /bad credentials|http 401|401 unauthorized|authentication failed/i;

/**
 * gh's raw stderr for a rejected credential names neither the account nor the
 * env var that supplied the token, which is the whole answer when a stale
 * `GH_TOKEN` is shadowing the keyring login. Re-check auth to name it.
 */
async function explainGhWriteFailure(sessionId: string, error: string): Promise<string> {
  if (!CREDENTIAL_REJECTION.test(error)) return error;
  try {
    const auth = await checkSessionGithubAuth({ sessionId });
    return auth.success ? describeGhAuth(auth) : error;
  } catch {
    return error;
  }
}

export function createDevSessionsPrSlice(
  set: DevSessionsSet,
  get: DevSessionsGet
): Pick<DevSessionsState,
  | 'pollPrStatuses'
  | 'loadPrContext'
  | 'createPullRequest'
  | 'linkPullRequest'
> {
  return {
    pollPrStatuses: async () => {
      const { sessions, projectId } = get();

      const sessionsWithOpenPr = sessions.filter(
        (session) => session.pr_number != null && session.pr_state !== 'MERGED' && session.pr_state !== 'CLOSED'
      );

      let anyStatusChanged = false;
      for (const session of sessionsWithOpenPr) {
        try {
          const result = await getSessionPrStatus({ sessionId: session.id });
          if (result.success && result.status) {
            if (
              result.status.state !== session.pr_state ||
              result.status.reviewDecision !== session.review_state ||
              result.status.isDraft !== session.pr_is_draft
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
          const result = await detectAndLinkSessionPr({ sessionId: session.id });
          if (result.success && result.status) {
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
        const authResult = await checkSessionGithubAuth({ sessionId });
        if (!authResult.success) {
          return {
            success: false,
            error:
              authResult.error ||
              describeGhAuth({ authenticated: false, reason: 'check_failed' }),
          };
        }
        if (!authResult.authenticated) {
          return { success: false, error: describeGhAuth(authResult) };
        }

        const contextResult = await buildSessionPrContext({ sessionId });
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
            const aiResult = await generateSessionPrContent({ sessionId, rawTitle, rawBody, prTemplate, diff: '', commitLog: '', featureContextPath });
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
        const result = await createSessionPullRequest({ sessionId, title, body, draft });
        if (!result.success) {
          return {
            success: false,
            error: await explainGhWriteFailure(
              sessionId,
              result.error || 'Failed to create pull request'
            ),
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
        const result = await linkSessionPullRequest({ sessionId, prIdentifier });
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
