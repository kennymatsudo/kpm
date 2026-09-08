/**
 * Resolves a path named in chat against the workspace and opens it in the
 * embedded editor.
 *
 * Lookup order is the current project's own files first, then each connected repo.
 * A relative path is tried against every source; an absolute one is only tried
 * against the source whose root actually contains it.
 */

import { useCallback, useState } from 'react';
import {
  emit,
  toast,
  useProjectDomainStore,
  useResourceDomainStore,
  useWorkspaceStore,
} from '../../stores';
import { readWorkspaceFile } from '../../services/workspaceFileService';
import { isAbsolutePathRef, relativeToRoot } from '../../../shared/pathRefs';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

export function useWorkspaceFileOpener() {
  const repos = useResourceDomainStore((state) => state.repos);
  const projects = useProjectDomainStore((state) => state.projects);
  const projectId = useProjectDomainStore((state) => state.currentProjectId);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const [pending, setPending] = useState(false);

  const openPath = useCallback(
    async (path: string) => {
      if (pending) return;

      setPending(true);
      try {
        const sources: { source: string; projectId: string | null; root: string | null }[] = [];
        if (projectId) {
          const project = projects.find((candidate) => candidate.id === projectId);
          sources.push({ source: 'project', projectId, root: project?.folder_path ?? null });
        }
        for (const repo of repos) {
          sources.push({ source: repo.id, projectId: null, root: resolveEffectiveRepoPath(repo) });
        }

        const isAbsolute = isAbsolutePathRef(path);
        let insideWorkspace = false;

        for (const { source, projectId: pid, root } of sources) {
          const relativePath = isAbsolute ? (root ? relativeToRoot(path, root) : null) : path;
          if (!relativePath) continue;
          insideWorkspace = true;

          try {
            const content = await readWorkspaceFile(source, relativePath, pid);
            openDocument(source, relativePath, content);
            // The editor only exists in the workspace view, and chat is
            // reachable from the planning view too, so surface it.
            emit({ type: 'navigate-to-view', payload: { view: 'workspace' } });
            return;
          } catch {
            // Not in this source — try the next.
          }
        }
        toast.error(
          insideWorkspace ? `File not found: ${path}` : `Not in this workspace: ${path}`
        );
      } finally {
        setPending(false);
      }
    },
    [pending, projectId, projects, repos, openDocument]
  );

  return { openPath, pending };
}
