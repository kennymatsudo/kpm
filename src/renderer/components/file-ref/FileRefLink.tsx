/**
 * Inline link for path-shaped tokens in rendered markdown (e.g.
 * `src/main/foo.ts` or `bar/baz.py:42`).
 *
 * Click resolves the path in this order:
 *  1) The current project's own files (the "Project Files" tree).
 *  2) Each connected repo.
 *
 * First match opens in the embedded workspace editor (read-only for
 * non-editable file types — `FileEditor` already handles that branching).
 * Repo files don't have a sidebar entry yet; supporting them here is
 * forward-compatible with future repo-file browsing.
 *
 * The `:lineNumber` suffix is preserved in the label but stripped before
 * resolution — the workspace editor opens at the top.
 */

import { useCallback, useState } from 'react';
import {
  isEditableFile,
  toast,
  useProjectDomainStore,
  useResourceDomainStore,
  useWorkspaceStore,
} from '../../stores';
import { readWorkspaceFile } from '../../services/workspaceFileService';
import { parsePathRef } from '../../../shared/pathRefs';
import { FileTextIcon } from '../icons';

interface FileRefLinkProps {
  text: string;
}

function filename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function FileRefLink({ text }: FileRefLinkProps) {
  const repos = useResourceDomainStore((state) => state.repos);
  const projectId = useProjectDomainStore((state) => state.currentProjectId);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const [pending, setPending] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (pending) return;

      const { path } = parsePathRef(text);
      const readOnly = !isEditableFile(filename(path));
      setPending(true);
      try {
        const sources: { source: string; projectId: string | null }[] = [];
        if (projectId) sources.push({ source: 'project', projectId });
        for (const repo of repos) sources.push({ source: repo.id, projectId: null });

        for (const { source, projectId: pid } of sources) {
          try {
            const content = await readWorkspaceFile(source, path, pid);
            openFile(source, path, content, readOnly);
            return;
          } catch {
            // Not in this source — try the next.
          }
        }
        toast.error(`File not found: ${path}`);
      } finally {
        setPending(false);
      }
    },
    [pending, projectId, repos, openFile, text]
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
