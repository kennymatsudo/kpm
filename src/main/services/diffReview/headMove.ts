import type { TurnFileChange } from '../../../shared/diffReview';

export interface HeadMoveInput {
  files: TurnFileChange[];
  dirtyBefore: Set<string>;
  dirtyAfter: Set<string>;
  headMoved: Set<string>;
  turnCommitFiles: Set<string>;
}

/** Drops files that changed only because HEAD moved (pull, checkout, rebase), not through the agent's edits. */
export function attributeHeadMove(input: HeadMoveInput): TurnFileChange[] {
  const { dirtyBefore, dirtyAfter, headMoved, turnCommitFiles } = input;
  return input.files.filter((file) => {
    const paths = file.oldPath ? [file.path, file.oldPath] : [file.path];
    const onlyHeadMove = paths.every(
      (p) => headMoved.has(p) && !dirtyBefore.has(p) && !dirtyAfter.has(p) && !turnCommitFiles.has(p),
    );
    return !onlyHeadMove;
  });
}
