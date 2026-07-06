import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type { McpServerStatus } from '../../claude/streaming';

export interface IChatSession {
  start(initialMessage: string | ContentBlockParam[]): Promise<void>;
  send(text: string): void;
  sendUserContent(content: ContentBlockParam[]): void;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  pendingQueuedCount(): number;
  cancelLastQueued(): object | null;
  setModel?(model: string): Promise<void>;
  mcpServerStatus?(): Promise<McpServerStatus[]>;
  reconnectMcpServer?(serverName: string): Promise<void>;
}
