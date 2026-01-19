/**
 *
 *
 * Uses a unified approval queue to handle multiple pending items from Claude.
 */

import { useShallow } from 'zustand/react/shallow';
import type { ApprovalItem } from '../../stores';
import { PendingActionsPanel } from '../planning/PendingActionsPanel';
import { PendingDocumentPanel } from '../planning/PendingDocumentPanel';

export function ApprovalOverlays() {
  // Get queue state
    useShallow((state) => ({
      queue: state.queue,
      removeById: state.removeById,
    }))
  );

  // Get project store data needed for panels
      executePlanActions: state.executePlanActions,
    }))
  );

  const [isApplying, setIsApplying] = useState(false);

  // Current item to show (first in queue)
  const currentItem = queue.length > 0 ? queue[0] : null;
  const queueLength = queue.length;

  // Handlers for different approval types

  const handleApprovePlanActions = useCallback(async (item: ApprovalItem & { type: 'plan-actions' }) => {
    setIsApplying(true);
    try {
    } finally {
      setIsApplying(false);
    }
  }, [executePlanActions, removeById]);

    if (!currentProjectId) return;
    setIsApplying(true);
    try {
      if (result.success) {
        removeById(item.id);
      }
    } finally {
      setIsApplying(false);
    }

  const handleAcceptDocument = useCallback(async (item: ApprovalItem & { type: 'document' }, content: string) => {
    if (!currentProjectId) return;
    setIsApplying(true);
    try {
    } finally {
      setIsApplying(false);
    }

  const handleDismiss = useCallback((id: string) => {
    removeById(id);
  }, [removeById]);


    return (
    );



        )}
  );
}
