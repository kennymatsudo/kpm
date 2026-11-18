import { memo } from 'react';
import { FileTextIcon } from '../icons';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { splitForDisplay } from '../../../shared/pathDisplay';

export interface TurnChangesTarget {
  chatSessionId: string;
  clientMessageId: string;
  scope: 'turn';
  focusFile?: { rootPath: string; path: string };
}

function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="flex flex-shrink-0 gap-1.5 font-mono text-tiny">
      <span className="text-success">+{additions}</span>
      <span className="text-danger">-{deletions}</span>
    </span>
  );
}

/** What one reply changed: a header with totals, then one row per file. */
export const TurnChangesCard = memo(function TurnChangesCard({
  chatSessionId,
  clientMessageId,
  onOpen,
}: {
  chatSessionId: string;
  clientMessageId: string;
  onOpen: (target: TurnChangesTarget) => void;
}) {
  const turn = useDiffReviewStore((state) =>
    state.turnChangesBySession[chatSessionId]?.find((t) => t.clientMessageId === clientMessageId)
  );
  if (!turn) return null;

  if (turn.files.length === 0) {
    if (!turn.unavailableReason) return null;
    return (
      <div className="mt-3 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-muted">
        Diff unavailable: {turn.unavailableReason}
      </div>
    );
  }

  const additions = turn.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = turn.files.reduce((sum, file) => sum + file.deletions, 0);
  const allAdded = turn.files.every((file) => file.status === 'added');
  const count = turn.files.length;
  const title = `${allAdded ? 'Created' : 'Edited'} ${count} ${count === 1 ? 'file' : 'files'}`;
  const open = (focusFile?: { rootPath: string; path: string }) =>
    onOpen({ chatSessionId, clientMessageId, scope: 'turn', focusFile });

  return (
    <div className="mt-3 rounded-lg border border-border-subtle bg-surface-1">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileTextIcon className="h-4 w-4 flex-shrink-0 text-text-muted" />
        <span className="text-sm text-text-primary">{title}</span>
        <Counts additions={additions} deletions={deletions} />
        <button type="button" className="btn btn-secondary ml-auto" onClick={() => open()}>
          View changes
        </button>
      </div>
      <ul className="border-t border-border-subtle">
        {turn.files.map((file) => {
          const { dir, base } = splitForDisplay(file.path);
          return (
            <li key={`${file.rootPath}:${file.path}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-depth-2"
                onClick={() => open({ rootPath: file.rootPath, path: file.path })}
              >
                <span className="flex min-w-0 flex-1 items-baseline">
                  <span
                    className="min-w-0 truncate text-text-muted"
                    style={{ direction: 'rtl', textOverflow: 'ellipsis' }}
                  >
                    {/* rtl flips a trailing slash; the isolate keeps it in place */}
                    <bdi>{dir}</bdi>
                  </span>
                  <span className="flex-shrink-0 text-text-primary">{base}</span>
                </span>
                <Counts additions={file.additions} deletions={file.deletions} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
