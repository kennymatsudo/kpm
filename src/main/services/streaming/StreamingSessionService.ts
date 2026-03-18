/**
 * StreamingSessionService - Application service for streaming Claude sessions.
 *
 * This service manages the lifecycle of streaming sessions for main project chat.
 *
 * Key features:
 * - Connect on project open (zero-latency first message)
 * - Auto-reconnect on timeout or crash
 * - Unified chat session for Plan and Workspace views (shared history)
 * - Multiple concurrent sessions per project (up to MAX_CONCURRENT_SESSIONS)
 *
 * Session keys:
 * - Main chat: `chat:{projectId}:{chatSessionId}` (unique per session)
 */

import type { BrowserWindow } from 'electron';
import type { ClaudeMdUpdatePayload } from '../../claude/tools/claudemd-update';
import type { DocumentUpdatePayload } from '../../claude/tools/document-update';
import {
  runWithToolExecutionContext,
  clearPendingDocumentContent,
  type PlanActionsEvent,
} from '../../claude/tools/createKpmServer';
import { type ServiceResult, type AsyncResult, success, failure } from '../result';
import type { PlanContext } from '../../claude/prompts';
import { getConfig } from '../../config';
import { clientManager } from '../../claude/clientManager';
import { extractFilePaths } from '../toollog/extractFilePaths';
import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type SessionState = 'idle' | 'connecting' | 'ready' | 'processing' | 'error' | 'closing';
export type SessionType = 'chat';
export type ModelType = 'opus' | 'sonnet' | 'haiku';
/** UI view mode - passed to prompts for context-aware suggestions */

/** Info about an active session (for UI display) */
export interface ActiveSessionInfo {
  chatSessionId: string;
  state: SessionState;
  isProcessing: boolean;
}

/** Segment state for tracking message boundaries */
interface SegmentState {
  currentSegmentId: number;
  hasTextInCurrentSegment: boolean;
  pendingActivities: Activity[];
}

/** Managed session with metadata */
interface ManagedSession {
  key: string;
  type: SessionType;
  projectId: string;
  state: SessionState;
  model: ModelType;
  lastActivity: number;
  sessionId?: string; // SDK session ID for resume
  currentView?: ViewMode;
  processingStartTime?: number; // Timestamp when processing started (for timeout detection)
  lastSdkActivity?: number; // Timestamp of most recent SDK message (for idle-while-processing detection)
  segmentState: SegmentState; // Track message segments for splitting bubbles
  chatSessionId?: string; // For persisting main chat messages
  accumulatedResponse: string; // Accumulate assistant response for persistence
  lastTurnFinalized: boolean; // True after a turn has emitted chat:done
  suppressLifecycleEventsOnEnd: boolean; // Suppress renderer lifecycle events when session ends
  unsubscribePlanActions: () => void;
  unsubscribeClaudeMdUpdate: () => void;
  unsubscribeDocumentUpdate: () => void;
}

// =============================================================================
// Configuration (accessed via getConfig().session)
// =============================================================================

// Helper to get session config values
const getSessionConfig = () => getConfig().session;

// =============================================================================
// Dependencies
// =============================================================================

export interface StreamingSessionServiceDeps {
  /** Project repository for session persistence */
  projectRepository: {
    get(id: string): Project | undefined;
    updateTokens(id: string, tokens: { input: number; output: number; total: number }): void;
  };

  /** Chat message repository for persisting messages */
  chatMessageRepository: {
    addMessage(
      sessionId: string,
      role: 'user' | 'assistant',
      content: string,
      chatSessionId?: string,
    ): void;
  };

  /** Chat session repository for Claude SDK session ID storage */
  chatSessionRepository: {
    updateClaudeSessionId(id: string, claudeSessionId: string): void;
  };

  /** Function to get the main window for IPC */
  getMainWindow: () => BrowserWindow | null;

  /** Build context for main chat sessions */
  buildContext: (projectId: string) => PlanContext | null;

  /** Build SDK options from context */
  buildSdkOptions: (
    context: PlanContext,
    options: {
      model: ModelType;
      currentView?: ViewMode;
      resumeSessionId?: string;
      mainWindow: BrowserWindow | null;
      onClaudeMdEdit?: (projectId: string, newContent: string) => void;
      onProjectFileWrite?: (projectId: string, filePath: string, content: string) => void;
    }
  ) => SDKOptions;

  /** Subscribe to plan actions from MCP tools */
  subscribeToPlanActions: (callback: (event: PlanActionsEvent) => void) => () => void;

  subscribeToClaudeMdUpdate: (callback: (update: ClaudeMdUpdatePayload) => void) => () => void;

  /** Subscribe to document update proposals from MCP tools */
  subscribeToDocumentUpdate: (callback: (update: DocumentUpdatePayload) => void) => () => void;


  /** Read a document file from the docs/ directory */
  readDocumentFile: (
    projectId: string,
    filePath: string
  ) => Promise<{ success: boolean; content: string | null; error?: string }>;

  /** Optional tool call logger for observability */
  toolCallLogger?: {
    logToolCall(entry: ToolCallLogEntry): void;
    finalizeTurn(projectId: string, chatSessionId: string): unknown;
    getCurrentTurnIndex(chatSessionId: string): number;
  };
}

// =============================================================================
// Factory Function
// =============================================================================

export function createStreamingSessionService(deps: StreamingSessionServiceDeps) {
  const sessions = new Map<string, ManagedSession>();
  let cleanupInterval: NodeJS.Timeout | null = null;


  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Session Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build session key from projectId and chatSessionId.
   * Key format: `chat:{projectId}:{chatSessionId}`
   */
  function buildSessionKey(projectId: string, chatSessionId: string): string {
    return `chat:${projectId}:${chatSessionId}`;
  }

  /**
   * Get all session keys for a project.
   */
  function getSessionKeysForProject(projectId: string): string[] {
    const prefix = `chat:${projectId}:`;
    return Array.from(sessions.keys()).filter(key => key.startsWith(prefix));
  }

  /**
   * Get count of active sessions for a project.
   */
  function getActiveSessionCount(projectId: string): number {
    return getSessionKeysForProject(projectId).length;
  }

  /**
   * Get info about all active sessions for a project.
   */
  function getActiveSessions(projectId: string): ActiveSessionInfo[] {
    const result: ActiveSessionInfo[] = [];
    const prefix = `chat:${projectId}:`;

    for (const [key, managed] of sessions) {
        result.push({
          chatSessionId: managed.chatSessionId,
          state: managed.state,
          isProcessing: managed.state === 'processing',
        });
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Session Operations (main chat)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wait for a session to become ready.
   */
  async function waitForSessionReady(key: string, timeoutMs: number): AsyncResult<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const managed = sessions.get(key);

      if (!managed) {
        return failure('Session disconnected while waiting');
      }

      if (managed.state === 'ready') {
        return success(undefined);
      }

      if (managed.state === 'error') {
        return failure('Session connection failed');
      }

      // Still connecting, wait and check again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return failure('Timeout waiting for session to connect');
  }

  /**
   * Send a message to an existing session, creating it if necessary.
   * Shared logic for main chat sessions.
   */
  async function sendMessageToSession(
    key: string,
    createSession: () => Promise<ServiceResult<{ sessionId: string }>>
  ): AsyncResult<void> {
    let managed = sessions.get(key);

    // Create new session with this message if none exists or error state
    if (!managed || managed.state === 'idle' || managed.state === 'error') {
      const createResult = await createSession();
      if (!createResult.ok) {
        return failure(createResult.error);
      }
      // Session was created and message was sent as initial message
      return success(undefined);
    }

    // Wait for connecting session to become ready (with timeout)
    if (managed.state === 'connecting') {
      const waitResult = await waitForSessionReady(key, getSessionConfig().sessionReadyTimeoutMs);
      if (!waitResult.ok) {
        return failure(waitResult.error);
      }
      managed = sessions.get(key);
    }

    if (managed?.state !== 'ready') {
      switch (managed?.state) {
        case 'processing':
        case 'connecting':
          return failure('Session is still connecting. Please wait a moment.');
        case 'error':
          return failure('Session encountered an error. Please try again.');
        case 'idle':
        case 'closing':
        case undefined:
          return failure('Session is not available. Please try again.');
      }
    }

    // Check if underlying session is still usable (may have ended after interrupt/abort)
    if (!managed.session.isReady()) {
      // Session ended - clean up and create new session with this message
      const reconnectMeta = {
        projectId: managed.projectId,
        chatSessionId: managed.chatSessionId,
        reason: 'reconnect_failed',
        source: 'sendMessageToSession:notReady',
      };
      await disconnectSession(key, { silent: true });
      const createResult = await createSession();
      if (!createResult.ok) {
        // Silent reconnect cleanup skips lifecycle IPC; emit deactivation on reconnect failure
        // so renderer doesn't keep stale active-session state.
        const mainWindow = deps.getMainWindow();
        mainWindow?.webContents.send('chat:session-deactivated', reconnectMeta);
        return failure(createResult.error);
      }
      return success(undefined);
    }

    // Clear pending document content cache from prior turns so edits
    // in this new message start fresh against on-disk content.

    managed.lastTurnFinalized = false;
    managed.state = 'processing';
    managed.processingStartTime = Date.now();
    managed.lastSdkActivity = Date.now();
    managed.lastActivity = Date.now();

    try {
        { projectId: managed.projectId, chatSessionId: managed.chatSessionId },
      );
      return success(undefined);
    } catch (error) {
      return failure(`Failed to send message: ${(error as Error).message}`);
    }
  }

  /** Session creation config */
  interface SessionCreationConfig {
    key: string;
    projectId: string;
    chatSessionId?: string;
    model: ModelType;
    resumeSessionId?: string;
    context: PlanContext;
    currentView?: ViewMode;
  }

  /**
   * Create and start a streaming session with an initial message.
   */
  async function createSession(config: SessionCreationConfig): AsyncResult<{ sessionId: string }> {
    const {
      key,
      projectId,
      chatSessionId,
      initialMessage,
      model,
      resumeSessionId,
      context,
      currentView,
      onMessage,
    } = config;

    // Disconnect existing session
    await disconnectSession(key, {
      reason: 'create_session_preflight',
      source: 'createSession',
    });

    const mainWindow = deps.getMainWindow();

    // Notify UI that we're connecting
    mainWindow?.webContents.send('chat:session-connecting', { projectId, chatSessionId });

    // Create subscriptions FIRST so we can always clean them up
    // Store references outside try block to ensure cleanup on any error
    let unsubscribePlanActions: (() => void) | null = null;
    let unsubscribeClaudeMdUpdate: (() => void) | null = null;
    let unsubscribeDocumentUpdate: (() => void) | null = null;

    try {
        model,
        currentView,
        resumeSessionId,
        mainWindow,
        onClaudeMdEdit: (editProjectId: string, newContent: string) => {
          void (async () => {
            const currentContent = await deps.readClaudeMd(editProjectId);
            mainWindow?.webContents.send('chat:claudemd-update', {
              projectId: editProjectId,
              oldContent: currentContent.success ? currentContent.content : null,
              newContent,
            });
          })().catch((error) => {
          });
        },
        // Callback for intercepted project file writes from the permission handler
        onProjectFileWrite: (writeProjectId: string, filePath: string, content: string) => {
          // Read current file for diff display
          void (async () => {
            const currentContent = await deps.readDocumentFile(writeProjectId, filePath);
            mainWindow?.webContents.send('chat:file-update', {
              projectId: writeProjectId,
              filePath,
              content,
              oldContent: currentContent.success ? currentContent.content : null,
            });
            console.log(`[StreamingSessionService] Project file write intercepted and emitted: ${filePath}`);
          })().catch((error) => {
            console.error('[StreamingSessionService] Failed to read file for intercepted write:', error);
          });
        },
      });

      // Subscribe to plan actions - store reference for cleanup
      unsubscribePlanActions = deps.subscribeToPlanActions((event) => {
        if (event.projectId !== projectId) return;
        if (event.chatSessionId !== chatSessionId) return;
        mainWindow?.webContents.send('chat:plan-actions', {
          projectId: event.projectId,
          chatSessionId: event.chatSessionId,
          actions: event.actions,
        });
      });

      unsubscribeClaudeMdUpdate = deps.subscribeToClaudeMdUpdate((update) => {
        const matchesSession = update.chatSessionId
          ? update.chatSessionId === chatSessionId
          : ['connecting', 'processing'].includes(sessions.get(key)?.state ?? '');

        if (
          update.projectId === projectId &&
          matchesSession
        ) {
        }
      });

      // Subscribe to document update proposals from the tool
      unsubscribeDocumentUpdate = deps.subscribeToDocumentUpdate((update) => {
        const matchesSession = update.chatSessionId
          ? update.chatSessionId === chatSessionId
          : ['connecting', 'processing'].includes(sessions.get(key)?.state ?? '');

        if (
          update.projectId === projectId &&
          matchesSession
        ) {
        }
      });

      // Create streaming session — let required: const can't be referenced in its own initializer closures
      // eslint-disable-next-line prefer-const
            chatSessionId,
          });

      // Store managed session BEFORE calling start() to ensure cleanup on timeout/error
      // State = 'connecting' until start() resolves successfully
      sessions.set(key, {
        key,
        type: 'chat',
        projectId,
        chatSessionId,
        session,
        state: 'connecting',
        model,
        lastActivity: Date.now(),
        currentView,
        segmentState: {
          currentSegmentId: 0,
          hasTextInCurrentSegment: false,
          pendingActivities: [],
        },
        accumulatedResponse: '',
        lastTurnFinalized: false,
        suppressLifecycleEventsOnEnd: false,
        unsubscribePlanActions,
        unsubscribeClaudeMdUpdate,
        unsubscribeDocumentUpdate,
      });

      await runWithToolExecutionContext({ projectId, chatSessionId }, () =>
      );

      const managed = sessions.get(key);
      const sessionId = managed?.sessionId ?? '';

      return success({ sessionId });
    } catch (error) {
      // Log full error details for debugging
      console.error('[StreamingSessionService] Chat session connection failed:', error);
      if (error && typeof error === 'object') {
      }

      // Clean up subscriptions - check both the managed session AND our local references
      // This ensures cleanup even if session storage failed
      const managed = sessions.get(key);
      if (managed) {
        managed.state = 'error';
        managed.unsubscribePlanActions();
        managed.unsubscribeClaudeMdUpdate();
        managed.unsubscribeDocumentUpdate();
      } else {
        // Session wasn't stored in map - clean up local references directly
        unsubscribePlanActions?.();
        unsubscribeClaudeMdUpdate?.();
        unsubscribeDocumentUpdate?.();
      }

      mainWindow?.webContents.send('chat:session-error', {
        projectId,
        chatSessionId,
        error: (error as Error).message,
      });

      return failure(`Connection failed: ${(error as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Chat Sessions (unified for Plan and Workspace views)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Disconnect a specific chat session, or all sessions for a project.
   * @param projectId - Project ID
   * @param chatSessionId - Optional session ID. If omitted, disconnects ALL sessions for the project.
   */
  async function disconnectChatSession(projectId: string, chatSessionId?: string): AsyncResult<void> {
    if (chatSessionId) {
      // Disconnect specific session
      const key = buildSessionKey(projectId, chatSessionId);
      await disconnectSession(key, {
        reason: 'user_disconnect_specific',
        source: 'disconnectChatSession',
      });
    } else {
      const keys = getSessionKeysForProject(projectId);
      await Promise.all(keys.map(key => disconnectSession(key, {
        reason: 'disconnect_all_sessions',
        source: 'disconnectChatSession',
      })));
    }
    return success(undefined);
  }

  /** Options for sending a chat message */
  interface SendChatMessageOptions {
    model?: ModelType;
    focusedResources?: { type: string; path: string }[];
    chatSessionId?: string;
    /** Current UI view - used for prompt customization */
    currentView?: ViewMode;
  }

  /**
   * Send a message in the main chat session.
   * Creates session with the message if no active session exists.
   * Used by both Plan and Workspace views (shared session/history).
   */
  async function sendChatMessage(
    projectId: string,
    message: string,
    options: SendChatMessageOptions = {}
  ): AsyncResult<void> {
    // chatSessionId is required for multi-session support
    const chatSessionId = options.chatSessionId;
    if (!chatSessionId) {
      return failure('chatSessionId is required');
    }

    const key = buildSessionKey(projectId, chatSessionId);
    const managed = sessions.get(key);

    // If view changed, disconnect and create new session
      await disconnectSession(key, {
        reason: 'view_changed',
        source: 'sendChatMessage',
      });
    }

  }

  /**
   * Create and start a main chat session with an initial message.
   * Shared between Plan and Workspace views.
   * Enforces maximum concurrent sessions limit per project.
   */
  async function createChatSession(
    projectId: string,
    options: SendChatMessageOptions = {}
  ): AsyncResult<{ sessionId: string }> {
    const project = deps.projectRepository.get(projectId);
    if (!project) {
      return failure('Project not found');
    }

    // chatSessionId is required for multi-session support
    const chatSessionId = options.chatSessionId;
    if (!chatSessionId) {
      return failure('chatSessionId is required');
    }

    const sessionKey = buildSessionKey(projectId, chatSessionId);

    // Check if this specific session already exists (resuming)
    const existingSession = sessions.get(sessionKey);
    const isResume = !!existingSession;

    // Enforce session limit only for NEW sessions (not resumes)
    if (!isResume) {
      const activeCount = getActiveSessionCount(projectId);
      }
    }

    const context = deps.buildContext(projectId);
    if (!context) {
      return failure('Failed to build context');
    }

    // Add current view to context for prompt customization
    if (options.currentView) {
      (context as PlanContext & { currentView?: ViewMode }).currentView = options.currentView;
    }

    // Get or create chat session for Claude SDK session tracking
    let resumeSessionId: string | undefined;


    }

    return createSession({
      key: sessionKey,
      projectId,
      chatSessionId,
      initialMessage,
      model: options.model ?? 'sonnet',
      resumeSessionId,
      context,
      currentView: options.currentView,
      onMessage: (session, msg) => handleChatSessionMessage(projectId, chatSessionId, session, msg),
    });
  }

  /**
   * Get the state of a specific chat session.
   */
  function getChatSessionState(projectId: string, chatSessionId: string): SessionState {
    const key = buildSessionKey(projectId, chatSessionId);
    return sessions.get(key)?.state ?? 'idle';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Interrupt the current execution in a session.
   * Resets state to 'ready' so new messages can be sent.
   * If interrupt hangs, force-disconnects after timeout.
   */
  async function interrupt(sessionKey: string): AsyncResult<void> {
    const managed = sessions.get(sessionKey);
    if (!managed) {
      return failure('No active session');
    }

    const INTERRUPT_TIMEOUT_MS = 5000; // 5 seconds max for interrupt

    try {
      // Race interrupt against timeout
      const interruptPromise = managed.session.interrupt();
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), INTERRUPT_TIMEOUT_MS)
      );

      const result = await Promise.race([interruptPromise, timeoutPromise]);

      if (result === 'timeout') {
        console.warn(`[StreamingSessionService] Interrupt timed out for ${sessionKey}, force disconnecting`);
        // Force disconnect since interrupt hung
        await disconnectSession(sessionKey, {
          reason: 'interrupt_timeout',
          source: 'interrupt',
        });
        return success(undefined);
      }

      // Reset state to ready so new messages can be sent
      managed.state = 'ready';
      managed.processingStartTime = undefined;
      managed.lastSdkActivity = undefined;
      return success(undefined);
    } catch (error) {
      // If interrupt fails, try to disconnect the session
      console.error(`[StreamingSessionService] Interrupt failed for ${sessionKey}:`, error);
      await disconnectSession(sessionKey, {
        reason: 'interrupt_error',
        source: 'interrupt',
      });
      return success(undefined); // Return success since we cleaned up
    }
  }

  /**
   * Change the model for a session.
   */
  async function setModel(sessionKey: string, model: ModelType): AsyncResult<void> {
    const managed = sessions.get(sessionKey);
    if (!managed) {
      return failure('No active session');
    }

    try {
      await managed.session.setModel(model);
      managed.model = model;
      return success(undefined);
    } catch (error) {
      return failure(`Failed to set model: ${(error as Error).message}`);
    }
  }

  /**
   * Dispose all sessions.
   * Called on app quit.
   */
  async function disposeAll(): Promise<void> {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    const keysToDispose = Array.from(sessions.keys());
    await Promise.all(keysToDispose.map(key => disconnectSession(key, {
      reason: 'dispose_all',
      source: 'disposeAll',
    })));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  async function disconnectSession(
    key: string,
    options: { silent?: boolean; reason?: string; source?: string } = {}
  ): Promise<void> {
    const managed = sessions.get(key);
    if (!managed) return;
    const stateBefore = managed.state;

    managed.state = 'closing';
    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();
    managed.suppressLifecycleEventsOnEnd = !!options.silent;

    try {
      await managed.session.close();
    } catch {
      // Ignore errors during close
    }

    // If handleSessionEnd already ran during close(), the session is already deleted
    // from the map and events were already sent. Only send events as a safety net if
    // close() didn't trigger the normal callback chain.
    if (sessions.has(key)) {
      sessions.delete(key);

      if (!options.silent) {
        const mainWindow = deps.getMainWindow();
        mainWindow?.webContents.send('chat:session-deactivated', {
          projectId: managed.projectId,
          chatSessionId: managed.chatSessionId,
          reason: options.reason ?? 'disconnect_fallback',
          source: options.source ?? 'disconnectSession',
          previousState: stateBefore,
        });
        mainWindow?.webContents.send('chat:done', {
          projectId: managed.projectId,
          chatSessionId: managed.chatSessionId,
        });
        console.log(`[StreamingSessionService] Disconnected session (events sent as fallback): ${key}`);
      } else {
        console.log(`[StreamingSessionService] Disconnected session silently for reconnect: ${key}`);
      }
    } else {
      console.log(`[StreamingSessionService] Disconnected session (events already sent by handleSessionEnd): ${key}`);
    }
  }

  /**
   * Handle messages from main chat session (unified for Plan and Workspace views).
   * Uses 'chat:*' IPC channels and persists to unified chat history.
   * All events include chatSessionId for routing to the correct session in the UI.
   */
    const mainWindow = deps.getMainWindow();
    const key = buildSessionKey(projectId, chatSessionId);
    const managed = sessions.get(key);

    if (!managed) return;
    if (managed.session !== sourceSession) {
      console.log(`[StreamingSessionService] Ignoring stale onMessage for ${key}`);
      return;
    }

    // Track latest SDK activity for idle-while-processing detection
    managed.lastSdkActivity = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkMsg = msg as any;

    // Note: Claude SDK session ID is captured in onReady callback and stored in chat_sessions table

    // Handle assistant messages (text chunks)
    if (sdkMsg.type === 'assistant') {
      const content = sdkMsg.message?.content || [];
      const segState = managed.segmentState;

      for (const block of content) {
        if (block.type === 'tool_use') {
          // Tool use after text = new segment boundary
          if (segState.hasTextInCurrentSegment) {
            segState.currentSegmentId++;
            segState.hasTextInCurrentSegment = false;
          }

          // Track tool activity with rich context
          const activity = getToolActivity(block.name, block.input as Record<string, unknown>);
          if (activity) {
            // Queue activity for the next text segment
            segState.pendingActivities.push(activity);
          }

          // Tool call logging (additive - does not affect activity flow)
          if (deps.toolCallLogger) {
            try {
              const toolInput = block.input as Record<string, unknown>;
              const entry: ToolCallLogEntry = {
                id: randomUUID(),
                projectId,
                chatSessionId,
                turnIndex: deps.toolCallLogger.getCurrentTurnIndex(chatSessionId),
                toolName: block.name,
                toolCategory: activity?.type ?? 'other',
                input: toolInput,
                filePaths: extractFilePaths(block.name, toolInput),
                label: activity?.label ?? block.name,
                detail: activity?.detail,
                timestamp: Date.now(),
              };
              deps.toolCallLogger.logToolCall(entry);
            } catch (logError) {
              console.error('[StreamingSessionService] Tool call logging failed:', logError);
            }
          }
        }

        if (block.type === 'text') {
          segState.hasTextInCurrentSegment = true;

          managed.accumulatedResponse += block.text;


          // Clear pending activities after attaching to text
          segState.pendingActivities = [];
        }
      }
    }

    // Handle API retry messages — surface to UI as activity
    if (isApiRetryMessage(sdkMsg)) {
      const delaySec = Math.round(sdkMsg.retry_delay_ms / 1000);
      const statusText = sdkMsg.error_status ? `HTTP ${sdkMsg.error_status}` : 'connection error';
      console.log(`[StreamingSessionService] API retry ${sdkMsg.attempt}/${sdkMsg.max_retries} (${statusText}, retry in ${delaySec}s) for ${key}`);
      mainWindow?.webContents.send('chat:activity', {
        projectId,
        chatSessionId,
        activity: {
          type: 'other' as const,
          label: 'Retrying',
          detail: `API ${statusText} — retrying in ${delaySec}s (attempt ${sdkMsg.attempt}/${sdkMsg.max_retries})`,
        },
      });
    }

    // Handle result message (final stats)
    if (sdkMsg.type === 'result') {
      const maxTokensReached = isMaxTokensReached(sdkMsg);

      // Check if response was truncated
      if (maxTokensReached) {
        console.log(`[StreamingSessionService] Response truncated (max_tokens) for ${key}`);
        mainWindow?.webContents.send('chat:truncated', {
          projectId,
          chatSessionId,
          reason: 'max_tokens',
        });
      }

      // Check if response hit max turns limit
      if (isMaxTurnsReached(sdkMsg)) {
        const numTurns = 'num_turns' in sdkMsg ? sdkMsg.num_turns : undefined;
        console.log(`[StreamingSessionService] Response truncated (max_turns: ${numTurns}) for ${key}`);
        mainWindow?.webContents.send('chat:error', {
          projectId,
          chatSessionId,
          error: `Response reached the turn limit (${numTurns ?? 'unknown'} turns). Send another message to continue.`,
        });
      }

      // Clear "Allow All Remaining" flag when response completes
      clientManager.clearAllowAllRemaining(projectId);

      // Persist and finalize — errors here must not prevent chat:done from being sent
      try {
          deps.chatMessageRepository.addMessage(
            projectId,
            'assistant',
          );
        }
      } catch (dbError) {
        console.error('[StreamingSessionService] Failed to persist assistant message:', dbError);
      }

      // Reset accumulated response for next turn
      managed.accumulatedResponse = '';

      try {
        deps.toolCallLogger?.finalizeTurn(projectId, chatSessionId);
      } catch (logError) {
        console.error('[StreamingSessionService] Failed to finalize tool call turn:', logError);
      }

      // Reset segment state for next turn
      managed.segmentState = {
        currentSegmentId: 0,
        hasTextInCurrentSegment: false,
        pendingActivities: [],
      };

      managed.lastTurnFinalized = true;
      if (maxTokensReached) {
        mainWindow?.webContents.send('chat:error', {
          projectId,
          chatSessionId,
          error: 'Response reached the output limit. Send another message to continue.',
        });
      }

      try {
        if (sdkMsg.usage) {
        }
      } catch (statsError) {
        console.error('[StreamingSessionService] Failed to update token stats:', statsError);
      }
    }
  }

    const managed = sessions.get(key);
    if (!managed) return;
    const stateBefore = managed.state;
    if (managed.session !== sourceSession) {
      console.log(`[StreamingSessionService] Ignoring stale onSessionEnd for ${key} (${reason})`);
      return;
    }

    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();

    sessions.delete(key);

    const mainWindow = deps.getMainWindow();
    const suppressRendererLifecycle =
      managed.suppressLifecycleEventsOnEnd ||
      // The turn was already finalized (chat:done emitted from result handler) and
      // this end callback is a post-turn teardown. Avoid emitting duplicate
      // deactivation/done events that can flip renderer state mid-recovery.
      (managed.lastTurnFinalized && stateBefore !== 'closing');

    if (suppressRendererLifecycle) {
      console.log(`[StreamingSessionService] Session ended after finalized turn; suppressing redundant lifecycle events: ${key} (${reason})`);
      return;
    }

    // Notify UI that session is deactivated (for multi-session UI updates)
    mainWindow?.webContents.send('chat:session-deactivated', {
      projectId: managed.projectId,
      chatSessionId: managed.chatSessionId,
      reason: `session_end_${reason}`,
      source: 'onSessionEnd',
      previousState: stateBefore,
    });

    // Ensure renderer always clears any pending streaming state for this session.
    mainWindow?.webContents.send('chat:done', {
      projectId: managed.projectId,
      chatSessionId: managed.chatSessionId,
    });

    if (reason === 'error' && error) {
      mainWindow?.webContents.send('chat:session-error', {
        projectId: managed.projectId,
        chatSessionId: managed.chatSessionId,
        error: error.message,
      });
    }

    console.log(`[StreamingSessionService] Session ended: ${key} (${reason})`);
  }

    const sessionConfig = getSessionConfig();


      }
    }, sessionConfig.cleanupIntervalMs);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Service Interface
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    // Main chat (unified for Plan and Workspace views, multi-session support)
    disconnectChatSession,
    sendChatMessage,
    getChatSessionState,
    getActiveSessions,
    interruptChatSession: (projectId: string, chatSessionId: string) =>
      interrupt(buildSessionKey(projectId, chatSessionId)),
    setChatModel: (projectId: string, chatSessionId: string, model: ModelType) =>
      setModel(buildSessionKey(projectId, chatSessionId), model),
    disposeAll,
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type StreamingSessionService = ReturnType<typeof createStreamingSessionService>;
