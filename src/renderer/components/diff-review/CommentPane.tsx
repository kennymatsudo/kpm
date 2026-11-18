import { DiffReviewView } from './DiffReviewView';
import { useFileReview } from './useFileReview';

const segmentClass = (isActive: boolean) =>
  `h-6 px-2 rounded-sm text-tiny font-medium transition-colors ${
    isActive ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
  }`;

/**
 * The Comment view of a file. Mount it only while that view is showing:
 * the diff is computed on mount.
 */
export function CommentPane({
  documentId,
  projectId,
  fullFile,
  onFullFileChange,
}: {
  documentId: string;
  projectId: string;
  /** The user's choice, or null to follow the default. */
  fullFile: boolean | null;
  onFullFileChange: (fullFile: boolean) => void;
}) {
  const { file, chatSessionId, hasTurnDiff, error } = useFileReview(documentId, true);
  const expandAll = fullFile ?? !hasTurnDiff;
  if (!file) return null;
  return (
    <div>
      {error && <p role="alert" className="px-3 py-1.5 text-tiny text-danger">{error}</p>}
      {hasTurnDiff && (
        <div role="group" aria-label="Diff scope" className="flex items-center gap-0.5 px-3 py-1">
          <button type="button" aria-pressed={!expandAll} onClick={() => onFullFileChange(false)} className={segmentClass(!expandAll)}>
            Changes only
          </button>
          <button type="button" aria-pressed={expandAll} onClick={() => onFullFileChange(true)} className={segmentClass(expandAll)}>
            Full file
          </button>
        </div>
      )}
      <DiffReviewView file={file} projectId={projectId} chatSessionId={chatSessionId} expandAll={expandAll} />
    </div>
  );
}
