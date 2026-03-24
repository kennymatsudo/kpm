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

  const hasPr = session.pr_number != null;

  useEffect(() => {
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
