import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type { SessionMcpInspection } from './sessionMcp';

export interface IChatSession {
  start(initialMessage: string | ContentBlockParam[]): Promise<void>;
  send(text: string): void;
  sendUserContent(content: ContentBlockParam[]): void | Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  pendingQueuedCount(): number;
  cancelLastQueued(): object | null;
  setModel?(model: string): Promise<void>;
  /** Absent when the provider cannot report its MCP servers. */
  mcp?(): SessionMcpInspection;
}
