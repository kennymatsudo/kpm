export function getSessionPrStatus(sessionId: string) {
  return window.api.github.getPrStatus(sessionId);
}

export function detectAndLinkSessionPr(sessionId: string) {
  return window.api.github.detectAndLinkPr(sessionId);
}

export function checkSessionGithubAuth(sessionId: string) {
  return window.api.github.checkAuth(sessionId);
}

export function buildSessionPrContext(sessionId: string) {
  return window.api.github.buildPrContext(sessionId);
}

export function generateSessionPrContent(
  sessionId: string,
  title: string,
  body: string,
  prTemplate: string | null,
) {
  return window.api.github.generatePrContent(
    sessionId,
    title,
    body,
    prTemplate,
  );
}

export function createSessionPullRequest(
  sessionId: string,
  title: string,
  body: string,
  draft: boolean
) {
  return window.api.github.createPr(sessionId, title, body, draft);
}

export function linkSessionPullRequest(sessionId: string, prIdentifier: string) {
  return window.api.github.linkPr(sessionId, prIdentifier);
}
