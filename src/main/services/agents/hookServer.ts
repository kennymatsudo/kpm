/**
 * Hook Ingestion Server - Local HTTP server for CLI agent hook callbacks.
 *
 * CLI agents (Claude Code, Codex, Gemini) are configured with hooks that POST
 * to http://localhost:{port}/hook/{sessionId} when tool events occur.
 * This server receives those events, maps them to AgentActivity, and
 * emits them via the AgentSessionManager.
 *
 * Uses Node's built-in http module — no external dependencies.
 */

import * as http from 'http';
import type { AgentActivity } from '../../../shared/agent-types';

const LOG_PREFIX = '[HookServer]';

export interface HookEvent {
  event: 'pre_tool_use' | 'post_tool_use' | 'stop' | 'permission_request' | 'error';
  toolName?: string;
  summary?: string;
  input?: string;
  error?: string;
  exitCode?: number;
}

export type HookEventHandler = (sessionId: string, hookEvent: HookEvent) => void;

export interface HookServer {
  readonly port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  onHookEvent(handler: HookEventHandler): void;
}

export function parseHookSessionId(url: string | undefined): string | null {
  const match = /^\/hook\/([A-Za-z0-9_-]+)$/.exec(url || '');
  return match?.[1] ?? null;
}

/**
 * Map a hook event to an AgentActivity for the activity feed.
 */
export function hookEventToActivity(hookEvent: HookEvent): AgentActivity | null {
  const timestamp = Date.now();

  switch (hookEvent.event) {
    case 'pre_tool_use':
      return {
        type: 'tool_use',
        timestamp,
        toolName: hookEvent.toolName,
        toolInput: hookEvent.input,
        summary: hookEvent.summary || hookEvent.toolName || 'Tool call',
        status: 'running',
      };
    case 'post_tool_use':
      return {
        type: 'tool_result',
        timestamp,
        toolName: hookEvent.toolName,
        summary: hookEvent.summary || hookEvent.toolName || 'Tool result',
        status: hookEvent.error ? 'failed' : 'success',
      };
    case 'stop':
      return {
        type: 'system',
        timestamp,
        summary: 'Agent stopped',
      };
    case 'error':
      return {
        type: 'error',
        timestamp,
        summary: hookEvent.error || 'Unknown error',
        content: hookEvent.error,
      };
    case 'permission_request':
      // Handled separately as a question, not an activity
      return null;
    default:
      return null;
  }
}

/**
 * Create a hook ingestion server on a random available port.
 */
export function createHookServer(): HookServer {
  let server: http.Server | null = null;
  let resolvedPort = 0;
  let eventHandler: HookEventHandler | null = null;

  function onHookEvent(handler: HookEventHandler): void {
    eventHandler = handler;
  }

  async function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        // Only accept POST /hook/{sessionId}
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        const sessionId = parseHookSessionId(req.url);
        if (!sessionId) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        let body = '';

        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          // Limit body size to 1MB
          if (body.length > 1024 * 1024) {
            res.writeHead(413);
            res.end('Payload too large');
            req.destroy();
          }
        });

        req.on('end', () => {
          try {
            const hookEvent = JSON.parse(body) as HookEvent;
            eventHandler?.(sessionId, hookEvent);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          } catch {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
      });

      // Listen on random port, localhost only
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        if (addr && typeof addr === 'object') {
          resolvedPort = addr.port;
          console.log(`${LOG_PREFIX} Started on port ${resolvedPort}`);
          resolve();
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      server.on('error', (err) => {
        console.error(`${LOG_PREFIX} Server error:`, err);
        reject(err);
      });
    });
  }

  async function stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => {
        console.log(`${LOG_PREFIX} Stopped`);
        server = null;
        resolve();
      });
    });
  }

  return {
    get port() {
      return resolvedPort;
    },
    start,
    stop,
    onHookEvent,
  };
}
