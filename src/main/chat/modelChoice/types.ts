import type { ServiceResult } from '../../services/result';
import type {
  ChatChoiceIntent,
  ChatChoiceView,
  ChatProvider,
  ChatSessionScope,
  PersistedChatModelChoice,
} from '../../../shared/types';

export type ChatChoiceOpenInput =
  | {
      projectId: string;
      chatSessionId: string;
      scope?: 'main';
      responding?: boolean;
    }
  | {
      projectId: string;
      chatSessionId: string;
      scope: 'focus_document';
      focusDocument: { path: string; title: string; contentHash: string };
      responding?: boolean;
    };

export interface ChatChoiceChangeInput {
  projectId: string;
  chatSessionId: string;
  expectedRevision: number;
  intent: ChatChoiceIntent;
  responding?: boolean;
}

export interface ResolvedChatChoice {
  provider: ChatProvider;
  model: string;
  effort: ChatChoiceView['selected']['effort'];
  revision: number;
}

export interface ChatChoiceSessionRow {
  id: string;
  project_id: string;
  provider: ChatChoiceView['selected']['provider'];
  scope: ChatSessionScope;
  chat_model_choice: string | null;
  chat_model_choice_revision: number;
}

export interface ChatModelChoiceService {
  open(input: ChatChoiceOpenInput): Promise<ServiceResult<ChatChoiceView>>;
  change(input: ChatChoiceChangeInput): Promise<ServiceResult<ChatChoiceView>>;
  resolveForTurn(projectId: string, chatSessionId: string): Promise<ServiceResult<ResolvedChatChoice>>;
}

export type ChatChoiceAggregate = PersistedChatModelChoice;
