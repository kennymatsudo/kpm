/**
 * Inline link for path-shaped tokens in rendered markdown (e.g.
 * `src/main/foo.ts` or `bar/baz.py:42`).
 *
 * The `:lineNumber` suffix is preserved in the label but stripped before
 * resolution — the workspace editor opens at the top.
 */

import { useCallback } from 'react';
import { parsePathRef } from '../../../shared/pathRefs';
import { FileTextIcon } from '../icons';
import { useWorkspaceFileOpener } from './useWorkspaceFileOpener';

interface FileRefLinkProps {
  text: string;
}

function filename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function FileRefLink({ text }: FileRefLinkProps) {
  const { openPath } = useWorkspaceFileOpener();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void openPath(parsePathRef(text).path);
    },
    [openPath, text]
  );

  const { path, line } = parsePathRef(text);
  const label = line != null ? `${filename(path)}:${line}` : filename(path);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 font-mono text-[0.875em] px-1 py-0.5 rounded bg-accent-subtle text-accent hover:bg-accent/20 transition-colors cursor-pointer align-baseline"
      title={`Open ${text}`}
    >
      <FileTextIcon className="w-3 h-3 flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
}
