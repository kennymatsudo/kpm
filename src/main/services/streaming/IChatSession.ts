import type { ChatAttachment } from '../../../shared/types';
import type { SessionMcpInspection } from './sessionMcp';

/** A follow-up was withdrawn before delivery, so it is neither saved nor reported as a failure. */
export class FollowUpDroppedError extends Error {
  constructor() {
    super('Follow-up was dropped before it reached the model');
    this.name = 'FollowUpDroppedError';
  }
}

export interface IChatSession {
  /** `initialMessage` may be empty when attachments carry the turn. */
  start(initialMessage: string, attachments?: ChatAttachment[]): Promise<void>;
  send(text: string): void | Promise<void>;
  /** Each provider turns the attachments into its own input; `text` may be empty. */
  sendWithAttachments(text: string, attachments: ChatAttachment[]): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  pendingQueuedCount(): number;
  cancelLastQueued(): object | null;
  setModel?(model: string): Promise<void>;
  /** Absent when the provider cannot report its MCP servers. */
  mcp?(): SessionMcpInspection;
}
