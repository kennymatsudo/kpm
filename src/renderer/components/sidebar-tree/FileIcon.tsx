import { isContextFile } from '../../../shared/contextFile';
import type { FileNode } from '../../../shared/types';
import { FileTextIcon, FolderIcon } from '../icons';

interface FileIconProps {
  node: FileNode;
  isExpanded?: boolean;
}

/**
 * File/folder icon based on file type.
 * Project context files (AGENTS.md / CLAUDE.md) get special accent styling.
 */
export function FileIcon({ node, isExpanded = false }: FileIconProps) {
  if (isContextFile(node.name)) {
    return <FileTextIcon className="w-4 h-4 text-accent flex-shrink-0" />;
  }

  if (node.isDirectory) {
    // An open folder steps up the text ladder rather than changing hue — the
    // chevron already reports open/closed, and hue is reserved for status.
    return (
      <FolderIcon
        className={`w-4 h-4 flex-shrink-0 ${isExpanded ? 'text-text-secondary' : 'text-text-tertiary'}`}
      />
    );
  }

  if (node.name.endsWith('.md')) {
    return <FileTextIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />;
  }

  return (
    <svg
      className="w-4 h-4 text-text-tertiary flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

/**
 * Repository icon for repo items — simple document page with folded corner
 */
export function RepoIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12-6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm0 0v2a4 4 0 0 1-4 4H9"
      />
    </svg>
  );
}

/**
 * Focus/bookmark icon for context toggle buttons
 */
export function FocusIcon({ isFocused }: { isFocused: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill={isFocused ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={isFocused ? 0 : 1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}
