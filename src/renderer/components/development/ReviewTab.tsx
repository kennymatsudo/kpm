/**
 */

  DevSessionWithPlanItem,
} from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useApprovalQueueStore } from '../../stores/approvalQueueStore';
import { toast } from '../../stores/toastStore';
import { openExternalUrl } from '../../services/shellService';

interface ReviewTabProps {
  session: DevSessionWithPlanItem;
}

  return (
  );
}

export function ReviewTab({ session }: ReviewTabProps) {
  const hasPr = session.pr_number != null;

  useEffect(() => {
    if (!hasPr) return;
    }

  return (
      </div>

          </div>
        ) : (
        )}
      </div>
    </div>
  );
}
