import type { TurnChanges } from '../../../shared/diffReview';

/** The most recent turn in a chat whose changes include this file. */
export function latestTurnForFile(
  turns: readonly TurnChanges[] | undefined,
  rootPath: string,
  path: string,
): TurnChanges | undefined {
  let latest: TurnChanges | undefined;
  for (const turn of turns ?? []) {
    if (!turn.files.some((f) => f.rootPath === rootPath && f.path === path)) continue;
    if (!latest || turn.createdAt >= latest.createdAt) latest = turn;
  }
  return latest;
}
