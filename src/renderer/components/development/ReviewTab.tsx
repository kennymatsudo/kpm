  DevSessionWithPlanItem,
} from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { useApprovalQueueStore } from '../../stores/approvalQueueStore';
import { toast } from '../../stores/toastStore';
import { openExternalUrl } from '../../services/shellService';
  session: DevSessionWithPlanItem;
  const hasPr = session.pr_number != null;
