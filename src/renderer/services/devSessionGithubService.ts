export function getSessionPrStatus(payload: { sessionId: string }) {
  return window.api.github.getPrStatus(payload);
}

export function detectAndLinkSessionPr(payload: { sessionId: string }) {
  return window.api.github.detectAndLinkPr(payload);
}

export function checkSessionGithubAuth(payload: { sessionId: string }) {
  return window.api.github.checkAuth(payload);
}

export function buildSessionPrContext(payload: { sessionId: string }) {
  return window.api.github.buildPrContext(payload);
}

export function generateSessionPrContent(payload: {
  sessionId: string;
  rawTitle: string;
  rawBody: string;
  prTemplate: string | null;
  diff: string;
  commitLog: string;
  featureContextPath?: string | null;
}) {
  return window.api.github.generatePrContent(payload);
}

export function createSessionPullRequest(payload: {
  sessionId: string;
  title: string;
  body: string;
  draft: boolean;
}) {
  return window.api.github.createPr(payload);
}

export function linkSessionPullRequest(payload: { sessionId: string; prIdentifier: string }) {
  return window.api.github.linkPr(payload);
}
