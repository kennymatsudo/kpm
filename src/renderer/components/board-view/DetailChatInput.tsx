/**
 *
 * - complete/failed/stopped: follow-up mode
 */

import { respondToAgent, followUpAgent } from '../../services/agentSessionService';
import { toast } from '../../stores';
import type { AgentSessionState } from '../../../shared/types';

interface DetailChatInputProps {
  devSessionId: string;
  agentState: AgentSessionState | undefined;
}

function getPlaceholder(state: AgentSessionState | undefined): string {
  switch (state) {
    case 'working':
    case 'starting':
      return 'Agent is working...';
    case 'waiting_for_input':
    case 'complete':
      return 'Ask for changes...';
    case 'failed':
    case 'stopped':
      return 'Give new instructions...';
    case undefined:
      return 'Send a message...';
  }
}







      }


