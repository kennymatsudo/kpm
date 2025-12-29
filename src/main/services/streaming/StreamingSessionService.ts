/**
 * StreamingSessionService - Application service for streaming Claude sessions.
 *
 *
 * Key features:
 * - Connect on project open (zero-latency first message)
 * - Auto-reconnect on timeout or crash
 *
 * Session keys:
 */

import type { BrowserWindow } from 'electron';
import type { PlanContext } from '../../claude/prompts';

// =============================================================================
// Types
// =============================================================================

export type SessionState = 'idle' | 'connecting' | 'ready' | 'processing' | 'error' | 'closing';
export type ModelType = 'opus' | 'sonnet' | 'haiku';

/** Managed session with metadata */
interface ManagedSession {
  key: string;
  type: SessionType;
  projectId: string;
  state: SessionState;
  model: ModelType;
  lastActivity: number;
  sessionId?: string; // SDK session ID for resume
  unsubscribePlanActions: () => void;
}

// =============================================================================
// =============================================================================


// =============================================================================
// Dependencies
// =============================================================================

export interface StreamingSessionServiceDeps {
  /** Project repository for session persistence */
  projectRepository: {
    get(id: string): Project | undefined;
    updateTokens(id: string, tokens: { input: number; output: number; total: number }): void;
  };

  /** Function to get the main window for IPC */
  getMainWindow: () => BrowserWindow | null;

  /** Build context for main chat sessions */
  buildContext: (projectId: string) => PlanContext | null;

  /** Build SDK options from context */
  buildSdkOptions: (
    options: {
      model: ModelType;
      resumeSessionId?: string;
      mainWindow: BrowserWindow | null;
      onClaudeMdEdit?: (projectId: string, newContent: string) => void;
    }
  ) => SDKOptions;

  /** Subscribe to plan actions from MCP tools */

}

// =============================================================================
// Factory Function
// =============================================================================

export function createStreamingSessionService(deps: StreamingSessionServiceDeps) {
  const sessions = new Map<string, ManagedSession>();
  let cleanupInterval: NodeJS.Timeout | null = null;


  function getSessionKeysForProject(projectId: string): string[] {
    return getSessionKeysForProject(projectId).length;
  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wait for a session to become ready.
   */
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
   */
  async function sendMessageToSession(
    key: string,
    createSession: () => Promise<ServiceResult<{ sessionId: string }>>
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
      if (!waitResult.ok) {
        return failure(waitResult.error);
      }
      managed = sessions.get(key);
    }

    }

    managed.state = 'processing';
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
    model: ModelType;
    resumeSessionId?: string;
  }

  /**
   * Create and start a streaming session with an initial message.
   */
    const {
      key,
      projectId,
      initialMessage,
      model,
      resumeSessionId,
      context,
      onMessage,
    } = config;

    // Disconnect existing session

    const mainWindow = deps.getMainWindow();

    // Notify UI that we're connecting

    // Create subscriptions FIRST so we can always clean them up
    // Store references outside try block to ensure cleanup on any error
    let unsubscribePlanActions: (() => void) | null = null;

    try {
        model,
        resumeSessionId,
        mainWindow,
        onClaudeMdEdit: (editProjectId: string, newContent: string) => {
          });
        },
      });

      // Subscribe to plan actions - store reference for cleanup
      });

          });

      // Store managed session BEFORE calling start() to ensure cleanup on timeout/error
      // State = 'connecting' until start() resolves successfully
      sessions.set(key, {
        key,
        projectId,
        session,
        state: 'connecting',
        model,
        lastActivity: Date.now(),
        unsubscribePlanActions,
      });


      const managed = sessions.get(key);
      const sessionId = managed?.sessionId ?? '';

      return success({ sessionId });
    } catch (error) {
      // Clean up subscriptions - check both the managed session AND our local references
      // This ensures cleanup even if session storage failed
      const managed = sessions.get(key);
      if (managed) {
        managed.state = 'error';
        managed.unsubscribePlanActions();
      } else {
        // Session wasn't stored in map - clean up local references directly
        unsubscribePlanActions?.();
      }

        error: (error as Error).message,
      });

      return failure(`Connection failed: ${(error as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   */
      const keys = getSessionKeysForProject(projectId);
    return success(undefined);
  }

    model?: ModelType;
  }

  /**
   * Creates session with the message if no active session exists.
   */
    projectId: string,
    message: string,
  }

  /**
   */
    projectId: string,
    const project = deps.projectRepository.get(projectId);
    if (!project) {
      return failure('Project not found');
    }

    const context = deps.buildContext(projectId);
    if (!context) {
      return failure('Failed to build context');
    }

   */
    return sessions.get(key)?.state ?? 'idle';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Interrupt the current execution in a session.
   * Resets state to 'ready' so new messages can be sent.
   */
    const managed = sessions.get(sessionKey);
    if (!managed) {
      return failure('No active session');
    }

    try {
      // Reset state to ready so new messages can be sent
      managed.state = 'ready';
      return success(undefined);
    } catch (error) {
    }
  }

  /**
   * Change the model for a session.
   */
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

    try {
      await managed.session.close();
    } catch {
      // Ignore errors during close
    }

  }

    const mainWindow = deps.getMainWindow();
    const managed = sessions.get(key);

    if (!managed) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkMsg = msg as any;


    // Handle assistant messages (text chunks)
    if (sdkMsg.type === 'assistant') {
      const content = sdkMsg.message?.content || [];
      for (const block of content) {
        if (block.type === 'tool_use') {
          // Track tool activity with rich context
          const activity = getToolActivity(block.name, block.input as Record<string, unknown>);
          if (activity) {
          }
        }
      }
    }

    // Handle result message (final stats)
    if (sdkMsg.type === 'result') {


      }
    }
  }

    const managed = sessions.get(key);
    if (!managed) return;

    managed.unsubscribePlanActions();
    sessions.delete(key);

    const mainWindow = deps.getMainWindow();

    if (reason === 'error' && error) {
    }

    console.log(`[StreamingSessionService] Session ended: ${key} (${reason})`);
  }


      }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Service Interface
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    disposeAll,
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type StreamingSessionService = ReturnType<typeof createStreamingSessionService>;
