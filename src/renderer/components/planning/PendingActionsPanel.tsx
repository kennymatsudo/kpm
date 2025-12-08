import type { PlanAction, PlanItem } from '../../../shared/types';

interface PendingActionsPanelProps {
  actions: PlanAction[];
  planItems: PlanItem[];
  onApprove: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
}


  // Check if any action references a missing item

    <AnimatePresence>
        >

            </div>

      )}
  );
}

  switch (action.type) {
    case 'create_item':
    case 'reparent':
    case 'set_label':
    case 'set_release':
    case 'add_dependency':
    case 'remove_dependency':
    case 'reorder':
    case 'set_position':
    case 'queue_for_tracker':
  }
}

}
