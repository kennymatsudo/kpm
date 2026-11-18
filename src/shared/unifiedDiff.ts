import type { DiffHunk, FileDiff } from './diffReview';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function stripPrefix(path: string): string {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

/** `diff --git a/x b/y` when x and y may contain spaces: split on the last " b/". */
function pathsFromGitHeader(line: string): { oldPath: string; newPath: string } {
  const body = line.slice('diff --git '.length);
  const split = body.lastIndexOf(' b/');
  if (split === -1) return { oldPath: body, newPath: body };
  return { oldPath: stripPrefix(body.slice(0, split)), newPath: body.slice(split + 3) };
}

/**
 * Parse `git diff` / `git diff-tree -p` output. Run git with
 * `-c core.quotePath=false` so non-ASCII paths arrive unquoted.
 */
export function parseUnifiedDiff(text: string, rootPath: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | null = null;
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const { oldPath, newPath } = pathsFromGitHeader(line);
      file = { rootPath, path: newPath, status: 'modified', additions: 0, deletions: 0, binary: false, hunks: [] };
      if (oldPath !== newPath) file.oldPath = oldPath;
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'added';
      else if (line.startsWith('deleted file mode')) file.status = 'deleted';
      else if (line.startsWith('rename from ')) {
        file.oldPath = line.slice('rename from '.length);
        file.status = 'renamed';
      } else if (line.startsWith('rename to ')) file.path = line.slice('rename to '.length);
      else if (line.startsWith('Binary files ')) file.binary = true;
      else if (line.startsWith('+++ ') && line.slice(4) !== '/dev/null') file.path = stripPrefix(line.slice(4));
    }

    const header = HUNK_HEADER.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { oldStart: oldLine, newStart: newLine, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (line.startsWith('+')) {
      hunk.lines.push({ kind: 'add', oldLine: null, newLine, text: line.slice(1) });
      newLine += 1;
      file.additions += 1;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ kind: 'del', oldLine, newLine: null, text: line.slice(1) });
      oldLine += 1;
      file.deletions += 1;
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ kind: 'context', oldLine, newLine, text: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
    // '\ No newline at end of file' and blank trailing lines fall through.
  }

  return files;
}
