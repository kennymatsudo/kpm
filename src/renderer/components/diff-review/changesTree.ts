import type { DiffReviewComment, FileDiff } from '../../../shared/diffReview';
import { splitForDisplay } from '../../../shared/pathDisplay';

/** A file with more changed lines than this starts collapsed. */
export const LARGE_DIFF_LINES = 400;

export const fileKey = (rootPath: string, path: string) => `${rootPath}:${path}`;

export interface TreeFile {
  key: string;
  rootPath: string;
  path: string;
  base: string;
  commentCount: number;
}

export interface TreeDir {
  dir: string;
  files: TreeFile[];
}

export interface TreeRoot {
  rootPath: string;
  label: string;
  dirs: TreeDir[];
}

export function countCommentsByFile(comments: readonly DiffReviewComment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    const key = fileKey(comment.rootPath, comment.filePath);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Files grouped by root, then directory, in the order they first appear. */
export function buildChangesTree(files: readonly FileDiff[], commentCounts: ReadonlyMap<string, number>): TreeRoot[] {
  const roots = new Map<string, TreeRoot>();
  for (const file of files) {
    let root = roots.get(file.rootPath);
    if (!root) {
      const label = file.rootPath.split(/[\\/]/).filter(Boolean).pop() ?? file.rootPath;
      root = { rootPath: file.rootPath, label, dirs: [] };
      roots.set(file.rootPath, root);
    }
    const { dir, base } = splitForDisplay(file.path);
    const dirName = dir.replace(/\/$/, '');
    let group = root.dirs.find((d) => d.dir === dirName);
    if (!group) {
      group = { dir: dirName, files: [] };
      root.dirs.push(group);
    }
    const key = fileKey(file.rootPath, file.path);
    group.files.push({ key, rootPath: file.rootPath, path: file.path, base, commentCount: commentCounts.get(key) ?? 0 });
  }
  return [...roots.values()];
}

export function totalsFor(files: readonly FileDiff[]): { files: number; additions: number; deletions: number } {
  return {
    files: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}
