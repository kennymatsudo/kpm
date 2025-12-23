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
} from '@anthropic-ai/claude-agent-sdk';
import { AsyncMessageQueue, type StreamingUserMessage } from './AsyncMessageQueue';

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


            this._isReady = false;
          } else {
            this._isReady = true;
            this.config.onReady?.(this.sessionId, mcpServers);
            this.readyResolver?.();
          }

          this.readyResolver = null;
          this.readyRejecter = null;
        }

      }

      // Generator exhausted normally
      this._isActive = false;
      this._isReady = false;
    } catch (error) {
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
    await this.queryInstance?.setPermissionMode(mode);
  }

  /**
   * Get current MCP server status.
   */
  async mcpServerStatus(): Promise<McpServerStatus[]> {
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
