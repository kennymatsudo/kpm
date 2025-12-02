
interface DiffRendererProps {
  diff: FieldDiff;
  className?: string;
}

/**
 * Renders a character-level diff with GitHub-style coloring.
 * Deleted text is shown in red with strikethrough.
 * Inserted text is shown in green.
 * Equal text is shown normally.
 */
export function DiffRenderer({ diff, className = '' }: DiffRendererProps) {
  if (!diff.hasChanges || diff.hunks.length === 0) {
  }

  return (
      {diff.hunks.map((hunk, index) => {
        switch (hunk.type) {
          case 'delete':
            return (
              <span
                key={index}
              >
                {hunk.value}
              </span>
            );
          case 'insert':
            return (
                {hunk.value}
              </span>
            );
          case 'equal':
          default:
            return (
                {hunk.value}
              </span>
            );
        }
      })}
    </div>
  );
}

interface FieldDiffViewProps {
  label: string;
  diff: FieldDiff | null;
  oldValue?: string | null;
  newValue?: string | null;
  isCreate?: boolean;
}

/**
 * Displays a labeled diff for a single field.
 * Shows "no changes" if diff is null or has no changes.
 * For creates, just shows the new value without diff styling.
 */
  const hasChanges = diff?.hasChanges ?? false;

  return (
        {!isCreate && !hasChanges && (
        )}
      </div>
      <div
      >
        {isCreate ? (
          // For creates, just show the value
          </span>
        ) : hasChanges && diff ? (
          // For updates with changes, show the diff
          <DiffRenderer diff={diff} />
        ) : (
          // No changes - show current value
          </span>
        )}
      </div>
    </div>
  );
}
