import { memo, useEffect, useMemo, useState } from 'react';
import type { Activity, ActivityType, MessageSegment } from '../../../shared/types';

type Step =
  | { kind: 'thought'; content: string; key: string }
  | { kind: 'tool'; activity: Activity; key: string };

interface ProcessTimelineProps {
  /** Finalized message segments. */
  segments?: MessageSegment[];
  /** In-flight thinking text accumulator. */
  streamingThinking?: string;
  /** Currently running/recent activities (live). */
  streamingActivities?: Activity[];
  isStreaming?: boolean;
  elapsedSeconds?: number | null;
}

const TOOL_NAME_BY_TYPE: Record<ActivityType, string> = {
  read: 'read_file',
  edit: 'edit',
  glob: 'glob',
  command: 'bash',
  thinking: 'thinking',
  other: 'tool',
};

function buildSteps(props: ProcessTimelineProps): Step[] {
  const steps: Step[] = [];
  const seenToolIds = new Set<string>();

  const pushFromSegments = (segs: MessageSegment[] | undefined) => {
    if (!segs) return;
    for (const seg of segs) {
      if (seg.type === 'thinking' && seg.content.trim()) {
        steps.push({
          kind: 'thought',
          content: seg.content.trim(),
          key: `thought-${steps.length}`,
        });
      } else if (seg.type === 'activity') {
        for (const a of seg.activities) {
          if (seenToolIds.has(a.id)) continue;
          seenToolIds.add(a.id);
        }
      }
    }
  };

  pushFromSegments(props.segments);

  // Streaming thinking surfaces as a single thought row at the top of the
  const streamingThinking = props.streamingThinking?.trim();
  if (streamingThinking) {
    const alreadyPresent = steps.some(
      (s) => s.kind === 'thought' && s.content === streamingThinking
    );
    if (!alreadyPresent) {
      steps.unshift({
        kind: 'thought',
        content: streamingThinking,
        key: 'thought-streaming',
      });
    }
  }

  if (props.streamingActivities) {
    for (const a of props.streamingActivities) {
      if (seenToolIds.has(a.id)) continue;
      seenToolIds.add(a.id);
      steps.push({ kind: 'tool', activity: a, key: a.id });
    }
  }

  return steps;
}

}

function getToolName(activity: Activity): string {
  return TOOL_NAME_BY_TYPE[activity.type];
}




  return (
  );
});

  isActive,
}: {
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
          >
        )}
    </div>
  );
});

  isActive,
}: {
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
              )}
              )}
            </span>
          )}
        )}
    </div>
  );
});


  useEffect(() => {
  }, [isStreaming]);

  if (steps.length === 0 && !isStreaming) return null;


  const toolCount = steps.filter((s) => s.kind === 'tool').length;
  const hasThought = steps.some((s) => s.kind === 'thought');
  const summaryParts: string[] = [];
  if (toolCount > 0) summaryParts.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`);

      <button
        type="button"
      >
      </button>

      )}
    </div>
  );
});
