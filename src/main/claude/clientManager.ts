/**
 * Client manager for Claude SDK sessions.
 *
 * including session disposal, cleanup on app quit, and session isolation.
 */

import type { BrowserWindow } from 'electron';

/**
 * Session metadata tracked by the client manager.
 */
interface ManagedSession {
  sessionId: string;
  projectId: string;
  lastActivity: number;
  /** Model used for this session */
  model: 'opus' | 'sonnet' | 'haiku';
}

/**
 * Options for getting or creating a session.
 * These are stored so that session context can be maintained.
 */
export interface SessionOptions {
  projectId: string;
  projectPath: string;
  sessionId?: string | null;
  model: 'opus' | 'sonnet' | 'haiku';
  mainWindow?: BrowserWindow | null;
}

/**
 * Singleton manager for Claude SDK sessions.
 *
 * - Stores session IDs for resumption
 * - Provides cleanup on app quit and manual disposal
 * - Implements idle timeout (30 minutes)
 */
class ClaudeClientManager {
  private sessions = new Map<string, ManagedSession>();
  private static instance: ClaudeClientManager;
  private idleCheckInterval?: NodeJS.Timeout;

  /**
   * Permission cache for "Allow Always" decisions.
   * Key: projectId -> Set<cacheKey>
   * Cache keys are formatted as "toolName:targetPath"
   */
  private permissionCache = new Map<string, Set<string>>();

  /** Idle timeout: 30 minutes */
  private static readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  /** Check for idle sessions every 5 minutes */
  private static readonly IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

  private constructor() {
    // Start periodic idle cleanup
    this.startIdleCleanup();
  }

  static getInstance(): ClaudeClientManager {
    if (!ClaudeClientManager.instance) {
      ClaudeClientManager.instance = new ClaudeClientManager();
    }
    return ClaudeClientManager.instance;
  }

  /**
   * Get the session ID for a main chat session, if one exists.
   * Returns the stored session ID that should be passed to query() for resumption.
   */
  getMainSessionId(projectId: string): string | null {
    const key = `main:${projectId}`;
    const session = this.sessions.get(key);
    return session?.sessionId ?? null;
  }

  /**
   * Store or update a main chat session.
   * Called after successfully creating/resuming a session.
   */
  storeMainSession(projectId: string, sessionId: string, model: 'opus' | 'sonnet' | 'haiku'): void {
    const key = `main:${projectId}`;
    this.sessions.set(key, {
      sessionId,
      projectId,
      lastActivity: Date.now(),
      model,
    });
    console.log(`[ClientManager] Stored main session: ${key} (${sessionId})`);
  }

  /**
   * Update the last activity timestamp for a session.
   * Called when a message is sent or received.
   */
  touchSession(key: string): void {
    const session = this.sessions.get(key);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Dispose a single session by key.
   */
    const session = this.sessions.get(key);
    if (session) {
      this.sessions.delete(key);
      console.log(`[ClientManager] Disposed session: ${key} (${session.sessionId})`);
    }
  }

  /**
   * Dispose all sessions.
   * Called on app quit.
   */
    const count = this.sessions.size;
    if (count > 0) {
      console.log(`[ClientManager] Disposing all ${count} sessions`);
      this.sessions.clear();
    }

    // Stop idle cleanup
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = undefined;
    }
  }

  /**
   * Start periodic cleanup of idle sessions.
   */
  private startIdleCleanup(): void {
    this.idleCheckInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, ClaudeClientManager.IDLE_CHECK_INTERVAL_MS);
  }

  /**
   * Remove sessions that have been idle for longer than IDLE_TIMEOUT_MS.
   */
  private cleanupIdleSessions(): void {
    const now = Date.now();
    const keysToDispose: string[] = [];

    for (const [key, session] of this.sessions.entries()) {
      const idleTime = now - session.lastActivity;
      if (idleTime > ClaudeClientManager.IDLE_TIMEOUT_MS) {
        keysToDispose.push(key);
      }
    }

    if (keysToDispose.length > 0) {
      console.log(`[ClientManager] Cleaning up ${keysToDispose.length} idle sessions`);
    }
  }

  // ============================================
  // Permission Cache Management
  // ============================================

  /**
   * Check if a permission has been cached for "Allow Always".
   */
  hasPermissionCached(projectId: string, cacheKey: string): boolean {
    return this.permissionCache.get(projectId)?.has(cacheKey) ?? false;
  }

  /**
   * Cache a permission decision for "Allow Always".
   */
  cachePermission(projectId: string, cacheKey: string): void {
    if (!this.permissionCache.has(projectId)) {
      this.permissionCache.set(projectId, new Set());
    }
    this.permissionCache.get(projectId)!.add(cacheKey);
    console.log(`[ClientManager] Cached permission: ${projectId} -> ${cacheKey}`);
  }

  /**
   * Clear permission cache for a project.
   * Called when starting a new session.
   */
  clearPermissionCache(projectId: string): void {
    this.permissionCache.delete(projectId);
    console.log(`[ClientManager] Cleared permission cache for project ${projectId}`);
  }

  /**
   * Clear all permission caches.
   */
  clearAllPermissionCaches(): void {
    this.permissionCache.clear();
    console.log(`[ClientManager] Cleared all permission caches`);
  }
}

// Export singleton instance
export const clientManager = ClaudeClientManager.getInstance();
