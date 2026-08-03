/**
 * Anchor for markdown links whose target is a workspace file rather than a URL
 * — `[Spec](docs/spec.md)`. Keeps the author's link text; clicking opens the
 * document in the embedded editor instead of handing a relative path to the OS.
 */

import { useCallback } from 'react';
import { workspaceLinkPath } from '../../../shared/pathRefs';
import { useWorkspaceFileOpener } from './useWorkspaceFileOpener';

interface WorkspaceLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export function WorkspaceLink({ href, children, ...props }: WorkspaceLinkProps) {
  const { openPath } = useWorkspaceFileOpener();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void openPath(workspaceLinkPath(href));
    },
    [openPath, href]
  );

  return (
    <a href={href} onClick={handleClick} title={`Open ${workspaceLinkPath(href)}`} {...props}>
      {children}
    </a>
  );
}
