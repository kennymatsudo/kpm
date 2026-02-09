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
import { type ServiceResult, type AsyncResult, success, failure } from '../result';
import type { PlanContext } from '../../claude/prompts';
import { getConfig } from '../../config';
import { clientManager } from '../../claude/clientManager';

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
  segmentState: SegmentState; // Track message segments for splitting bubbles
  chatSessionId?: string; // For persisting main chat messages
  accumulatedResponse: string; // Accumulate assistant response for persistence
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

  subscribeToClaudeMdUpdate: (callback: (update: ClaudeMdUpdatePayload) => void) => () => void;

  /** Subscribe to document update proposals from MCP tools */
  subscribeToDocumentUpdate: (callback: (update: DocumentUpdatePayload) => void) => () => void;


  /** Read a document file from the docs/ directory */
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
    }

    // Check if underlying session is still usable (may have ended after interrupt/abort)
    if (!managed.session.isReady()) {
      // Session ended - clean up and create new session with this message
      const createResult = await createSession();
      if (!createResult.ok) {
        return failure(createResult.error);
      }
      return success(undefined);
    }

    managed.state = 'processing';
    managed.processingStartTime = Date.now();
    managed.lastActivity = Date.now();

    try {
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
          });
        },
        // Callback for intercepted project file writes from the permission handler
        onProjectFileWrite: (writeProjectId: string, filePath: string, content: string) => {
          // Read current file for diff display
          });
        },
      });

      // Subscribe to plan actions - store reference for cleanup
      });

      unsubscribeClaudeMdUpdate = deps.subscribeToClaudeMdUpdate((update) => {
        }
      });

      // Subscribe to document update proposals from the tool
      unsubscribeDocumentUpdate = deps.subscribeToDocumentUpdate((update) => {
        }
      });

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
        unsubscribePlanActions,
        unsubscribeClaudeMdUpdate,
        unsubscribeDocumentUpdate,
      });


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
    } else {
      const keys = getSessionKeysForProject(projectId);
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
        return success(undefined);
      }

      // Reset state to ready so new messages can be sent
      managed.state = 'ready';
      managed.processingStartTime = undefined;
      return success(undefined);
    } catch (error) {
      // If interrupt fails, try to disconnect the session
      console.error(`[StreamingSessionService] Interrupt failed for ${sessionKey}:`, error);
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
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────────────────────

    const managed = sessions.get(key);
    if (!managed) return;
    managed.state = 'closing';
    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();

    try {
      await managed.session.close();
    } catch {
      // Ignore errors during close
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
        }

        if (block.type === 'text') {
          segState.hasTextInCurrentSegment = true;

          managed.accumulatedResponse += block.text;


          // Clear pending activities after attaching to text
          segState.pendingActivities = [];
        }
      }
    }

    // Handle result message (final stats)
    if (sdkMsg.type === 'result') {

      // Check if response was truncated
        console.log(`[StreamingSessionService] Response truncated (max_tokens) for ${key}`);
        mainWindow?.webContents.send('chat:truncated', {
          projectId,
          chatSessionId,
          reason: 'max_tokens',
        });
      }

      // Clear "Allow All Remaining" flag when response completes
      clientManager.clearAllowAllRemaining(projectId);

      }

      // Reset accumulated response for next turn
      managed.accumulatedResponse = '';

      // Reset segment state for next turn
      managed.segmentState = {
        currentSegmentId: 0,
        hasTextInCurrentSegment: false,
        pendingActivities: [],
      };


      }
    }
  }

    const managed = sessions.get(key);
    if (!managed) return;

    managed.unsubscribePlanActions();
    managed.unsubscribeClaudeMdUpdate();
    managed.unsubscribeDocumentUpdate();

    sessions.delete(key);

    const mainWindow = deps.getMainWindow();

    // Notify UI that session is deactivated (for multi-session UI updates)
    mainWindow?.webContents.send('chat:session-deactivated', {
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
