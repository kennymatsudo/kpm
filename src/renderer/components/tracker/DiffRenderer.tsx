import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';

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
              <span key={index} className="text-text-secondary">
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
            {newValue || <span className="text-text-tertiary italic">Empty</span>}
          </span>
        ) : hasChanges && diff ? (
          // For updates with changes, show the diff
          <DiffRenderer diff={diff} />
        ) : (
          // No changes - show current value
            {oldValue || newValue || <span className="text-text-tertiary italic">Empty</span>}
          </span>
        )}
      </div>
    </div>
  );
}

interface StatusTransitionViewProps {
  transition: StatusTransitionInfo;
}

/**
 * Displays a status transition for sync review.
 */
  const targetConfig = STATUS_CATEGORY_CONFIG[transition.targetCategory];

  return (
        {transition.warning && (
          </span>
        )}
      </div>
          {/* Current status */}
            {transition.currentStatus}
          </span>

          {/* Arrow */}
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>

          </span>
        </div>

        {/* Warning message */}
        {transition.warning && (
          </div>
        )}
      </div>
    </div>
  );
}
