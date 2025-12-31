/**
 * Chat Domain Repository Interfaces
 *
 */

import type {
  ChatMessage,
  ChatSessionSummary,
} from '../../../shared/types';

// =============================================================================
// =============================================================================

export interface IChatMessageRepository {
  /** Delete sessions beyond the keep limit (default 10), returns count deleted */
}
