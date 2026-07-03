export function linkPullRequestToPlanItem(payload: { planItemId: string; repoId: string; prIdentifier: string }) {
  return window.api.github.linkPrToItem(payload);
}
