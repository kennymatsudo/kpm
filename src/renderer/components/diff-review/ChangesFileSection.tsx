import { useState } from 'react';
import type { FileDiff } from '../../../shared/diffReview';
import { ChevronRightIcon } from '../icons';
import { DiffReviewView } from './DiffReviewView';
import { LARGE_DIFF_LINES } from './changesTree';

interface ChangesFileSectionProps {
  file: FileDiff;
  projectId: string;
  chatSessionId: string;
  register: (element: HTMLElement | null) => void;
}

/** One file in the Changes view: a sticky header and its diff. */
export function ChangesFileSection({ file, projectId, chatSessionId, register }: ChangesFileSectionProps) {
  const large = file.additions + file.deletions > LARGE_DIFF_LINES;
  const [collapsed, setCollapsed] = useState(large);
  const [viewed, setViewed] = useState(false);
  const [full, setFull] = useState(false);

  const toggleViewed = (next: boolean) => {
    setViewed(next);
    setCollapsed(next);
  };

  return (
    <section
      ref={register}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 600px' }}
      className="border-b border-border-subtle"
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-1.5">
        <button
          type="button"
          aria-label={collapsed ? 'Expand file' : 'Collapse file'}
          aria-expanded={!collapsed}
          className="flex-shrink-0 text-text-muted hover:text-text-primary"
          onClick={() => setCollapsed((current) => !current)}
        >
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-text-primary" title={file.path}>
          {file.path}
        </span>
        <span className="flex flex-shrink-0 gap-1.5 font-mono text-tiny">
          <span className="text-success">+{file.additions}</span>
          <span className="text-danger">-{file.deletions}</span>
        </span>
        <button type="button" className="btn btn-ghost" aria-pressed={full} onClick={() => setFull((v) => !v)}>
          Full file
        </button>
        <label className="flex flex-shrink-0 items-center gap-1.5 text-xs text-text-secondary">
          <input type="checkbox" checked={viewed} onChange={(e) => toggleViewed(e.target.checked)} />
          Viewed
        </label>
      </header>
      {collapsed ? (
        large && !viewed && (
          <div className="p-3">
            <button type="button" className="btn btn-secondary" onClick={() => setCollapsed(false)}>
              Load diff
            </button>
          </div>
        )
      ) : (
        <DiffReviewView file={file} projectId={projectId} chatSessionId={chatSessionId} expandAll={full} />
      )}
    </section>
  );
}
