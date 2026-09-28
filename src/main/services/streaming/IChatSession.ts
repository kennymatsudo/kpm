import type { ChatAttachment } from '../../../shared/types';
import type { SessionMcpInspection } from './sessionMcp';

export interface IChatSession {
  /** `initialMessage` may be empty when attachments carry the turn. */
  start(initialMessage: string, attachments?: ChatAttachment[]): Promise<void>;
  send(text: string): void;
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
