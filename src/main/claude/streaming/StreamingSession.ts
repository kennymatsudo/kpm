/**
 * StreamingSession - Low-level SDK wrapper for streaming conversations.
 *
 * This class wraps the Claude SDK's query() function with an async generator pattern,
 * enabling multi-turn conversations without subprocess overhead per message.
 *
 * Key concepts:
 * - start(): Initializes the session and waits for MCP servers to connect
 * - send(): Queues a user message to be sent to Claude
 * - The SDK subprocess stays alive between messages
 *
 * This is a low-level wrapper - use StreamingSessionService for business logic.
 */

import {
  query,
  type Query,
  type SDKMessage,
  type Options as SDKOptions,
  type McpServerStatus,
  type McpServerConfig,
  type McpSetServersResult,
  type PermissionMode,
  type SDKControlGetContextUsageResponse,
  type ModelInfo,
  type AccountInfo,
} from '@anthropic-ai/claude-agent-sdk';
export type { McpServerStatus, SDKControlGetContextUsageResponse, ModelInfo, AccountInfo } from '@anthropic-ai/claude-agent-sdk';
import { AsyncMessageQueue, type StreamingUserMessage } from './AsyncMessageQueue';
import { getConfig } from '../../config';

/**
 * Configuration for creating a StreamingSession.
 */
export interface StreamingSessionConfig {
  /** SDK options passed to query() */
  sdkOptions: SDKOptions;

  /** Called for each message from Claude */
  onMessage: (msg: SDKMessage) => void;

  /** Called when session ends (normal or error) */
  onSessionEnd?: (reason: 'completed' | 'error' | 'closed', error?: Error) => void;

  /** Called when MCP is connected and session is ready */
  onReady?: (sessionId: string, mcpStatus: McpServerStatus[]) => void;

  /** Called if MCP connection fails */
  onMcpError?: (failedServers: McpServerStatus[]) => void;
}

/**
 * Low-level streaming session wrapper for Claude SDK.
 *
 * Usage:
 * 1. Create with config (SDK options, callbacks)
 * 2. Call start() - waits for MCP to connect
 * 3. Call send() to queue messages
 * 4. Call close() when done
 */
export class StreamingSession {
  private config: StreamingSessionConfig;
  private messageQueue: AsyncMessageQueue;
  private queryInstance: Query | null = null;
  private messageLoopPromise: Promise<void> | null = null;
  private sessionId: string | null = null;
  private _isActive = false;
  private _isReady = false;
  private readyResolver: (() => void) | null = null;
  private readyRejecter: ((error: Error) => void) | null = null;

  constructor(config: StreamingSessionConfig) {
    this.config = config;
    this.messageQueue = new AsyncMessageQueue();
  }

  /**
   * Start the session with an initial message and wait for MCP to be ready.
   * The SDK requires an initial message to initialize the session.
   *
   * @returns Resolves when MCP is connected and session can accept more messages.
   * @throws If MCP connection fails or timeout is reached.
   */
    if (this._isActive) {
      throw new Error('Session already started');
    }

      throw new Error('Initial message is required to start session');
    }

    this._isActive = true;

    // Create promise that resolves when we receive init message
    const readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejecter = reject;
    });

    // Create timeout promise to prevent indefinite hangs
    const startTimeoutMs = getConfig().session.sessionReadyTimeoutMs;
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        this._isReady = false;
      }, startTimeoutMs);
    });

    this.messageQueue.push({
      type: 'user',
      session_id: '', // Will be filled by SDK
      message: {
        role: 'user',
      },
      parent_tool_use_id: null,
    });

    // Create the query with async generator for streaming input
    this.queryInstance = query({
      prompt: this.createInputGenerator(),
    });

    // Start message loop (runs in background)
    this.messageLoopPromise = this.runMessageLoop();

    try {
      // Wait for init message (MCP connected) OR timeout
      await Promise.race([readyPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Create the async generator that yields user messages to the SDK.
   * This bridges our push-based IPC to the SDK's pull-based generator.
   */
  private async *createInputGenerator(): AsyncIterable<StreamingUserMessage> {
    while (true) {
      const msg = await this.messageQueue.pull();

      if (msg === null) {
        return; // Queue closed, end generator
      }

      yield msg;
    }
  }

  /**
   * Main message loop - iterates over SDK messages and dispatches to callbacks.
   * Runs in the background after start() is called.
   */
  private async runMessageLoop(): Promise<void> {
    if (!this.queryInstance) return;

    try {
      for await (const msg of this.queryInstance) {
        // Handle init message - check MCP status
        if (isInitMessage(msg)) {
          this.sessionId = msg.session_id;

          // Check MCP server status (cast from init message's loose `status: string`)
          const mcpServers = (msg.mcp_servers ?? []) as McpServerStatus[];

          }

            this._isReady = false;
          } else {
            this._isReady = true;
            this.config.onReady?.(this.sessionId, mcpServers);
            this.readyResolver?.();
          }

          this.readyResolver = null;
          this.readyRejecter = null;
        }

        // Dispatch all messages to handler — errors must not kill the SDK message loop
        try {
          this.config.onMessage(msg);
        } catch (callbackError) {
          console.error('[StreamingSession] onMessage callback error (session continues):', callbackError);
        }
      }

      // Generator exhausted normally
      this._isActive = false;
      this._isReady = false;
    } catch (error) {
      // Log full error details for debugging
      console.error('[StreamingSession] Message loop error:', error);
      if (error && typeof error === 'object') {
        if ('stderr' in error) console.error('[StreamingSession] stderr:', (error as { stderr: string }).stderr);
        if ('stdout' in error) console.error('[StreamingSession] stdout:', (error as { stdout: string }).stdout);
      }
      this._isActive = false;
      this._isReady = false;
      this.readyRejecter?.(error as Error);
      this.config.onSessionEnd?.('error', error as Error);
      throw error;
    }
  }

  /**
   * Send a text message to Claude.
   * @throws If session is not ready (start() not resolved)
   */
  send(text: string): void {
    if (!this._isReady) {
      throw new Error('Session is not ready - wait for start() to resolve');
    }

    this.sendRaw({
      type: 'user',
      session_id: this.sessionId || '',
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
      parent_tool_use_id: null,
    });
  }

  /**
   * Send a structured user message to Claude.
   * Use this for more complex message structures.
   * @throws If session is not active
   */
  sendRaw(msg: StreamingUserMessage): void {
    if (!this._isActive) {
      throw new Error('Session is not active');
    }
    this.messageQueue.push(msg);
  }

  /**
   * Interrupt the current execution.
   * Useful for stopping long-running operations.
   */
  async interrupt(): Promise<void> {
    await this.queryInstance?.interrupt();
  }

  /**
   * Change the model mid-session.
   * The next message will use the new model.
   */
  async setModel(model: string): Promise<void> {
    await this.queryInstance?.setModel(model);
  }

  /**
   * Change the permission mode mid-session.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.queryInstance?.setPermissionMode(mode);
  }

  /**
   * Get current MCP server status.
   */
  async mcpServerStatus(): Promise<McpServerStatus[]> {
    return (await this.queryInstance?.mcpServerStatus()) ?? [];
  }

  /**
   * Reconnect a disconnected MCP server.
   * Useful for error recovery if an MCP server drops connection.
   * @param serverName - The name of the MCP server to reconnect
   * @returns Resolves when reconnection attempt completes
   */
  async reconnectMcpServer(serverName: string): Promise<void> {
    await this.queryInstance?.reconnectMcpServer(serverName);
  }

  /**
   * Enable or disable an MCP server.
   * Useful for dynamically managing server availability.
   * @param serverName - The name of the MCP server to toggle
   * @param enabled - Whether the server should be enabled
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
    await this.queryInstance?.toggleMcpServer(serverName, enabled);
  }

  /**
   * Dynamically replace the set of external MCP servers.
   * Servers not in the new set are disconnected; new ones are connected.
   * Does not affect the built-in kpm server or servers loaded via plugins.
   */
  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult | null> {
    return (await this.queryInstance?.setMcpServers(servers)) ?? null;
  }

  /**
   * Get a breakdown of context window usage by category.
   * Useful for showing users how much context is consumed.
   */
  async getContextUsage(): Promise<SDKControlGetContextUsageResponse | null> {
    return (await this.queryInstance?.getContextUsage()) ?? null;
  }

  /**
   * Get the list of available models from the SDK.
   * Returns model info including display names, descriptions, and capabilities.
   */
  async supportedModels(): Promise<ModelInfo[]> {
    return (await this.queryInstance?.supportedModels()) ?? [];
  }

  /**
   * Get information about the authenticated account.
   */
  async accountInfo(): Promise<AccountInfo | null> {
    return (await this.queryInstance?.accountInfo()) ?? null;
  }

  /**
   * Stop a running background task by ID.
   */
  async stopTask(taskId: string): Promise<void> {
    await this.queryInstance?.stopTask(taskId);
  }

  /**
   * Get the session ID (available after start() resolves).
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if the session is active (started but may still be connecting).
   */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Check if the session is ready to receive messages.
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Close the session gracefully.
   * The session will end after any pending messages are processed.
   */
  async close(): Promise<void> {


    try {
    }
  }
}
