/** Which side of a diff a comment's line numbers count on. */
export type DiffSide = 'new' | 'old';

export interface DiffReviewComment {
  id: string;
  projectId: string;
  chatSessionId: string;
  /** Absolute path of the snapshot root (project folder or repo). */
  rootPath: string;
  /** Path relative to `rootPath`, forward slashes. */
  filePath: string;
  side: DiffSide;
  startLine: number;
  endLine: number;
  /** The selected lines' text on `side`, joined with \n. */
  quotedText: string;
  body: string;
  createdAt: string;
}

export interface NewDiffReviewComment {
  projectId: string;
  chatSessionId: string;
  rootPath: string;
  filePath: string;
  side: DiffSide;
  startLine: number;
  endLine: number;
  quotedText: string;
  body: string;
}

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface TurnFileChange {
  rootPath: string;
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions: number;
  deletions: number;
}

/** What one chat reply changed, across every root it could write to. */
export interface TurnChanges {
  chatSessionId: string;
  /** The user message that started the turn. */
  clientMessageId: string;
  createdAt: string;
  files: TurnFileChange[];
  /** Set when no root could be snapshotted or diffed. */
  unavailableReason?: string;
}

export type DiffScope = 'turn' | 'chat' | 'uncommitted';

export interface DiffLine {
  kind: 'context' | 'add' | 'del';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface FileDiff {
  rootPath: string;
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
}

export function toTurnFileChange(diff: FileDiff): TurnFileChange {
  return {
    rootPath: diff.rootPath,
    path: diff.path,
    ...(diff.oldPath ? { oldPath: diff.oldPath } : {}),
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
  };
}
