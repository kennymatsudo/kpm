export function linkPullRequestToPlanItem(planItemId: string, repoId: string, prIdentifier: string) {
  return window.api.github.linkPrToItem(planItemId, repoId, prIdentifier);
}
