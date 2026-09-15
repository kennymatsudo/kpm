/**
 * The one decision for an MCP elicitation: open a URL, auto-accept, ask the
 * user, or decline.
 *
 * Claude and Codex each carried a copy and the copies drifted — only Codex
 * consulted its auto-approve list, and only Claude passed the turn's abort
 * signal through to the prompt. Both re-implemented the scheme check that
 * stops a compromised MCP server handing back a `file://` URL, so pi would
 * have been a third chance to forget it.
 *
 * Ordering is the guarantee: the scheme check runs before anything can
 * auto-accept, so no allowlist can wave through a URL we would not open.
 */

import { isAllowedExternalUrl } from '../../security/externalUrl';

/**
 * The provider-neutral subset of an elicitation. Claude's SDK types these
 * fields; Codex hands over raw JSON, so nothing may be assumed present.
 */
export interface McpElicitationRequest {
  mode?: unknown;
  url?: unknown;
  message?: unknown;
  serverName?: unknown;
}

export interface McpElicitationDecision {
  action: 'accept' | 'decline';
  content?: Record<string, string | number | boolean | string[]>;
}

export interface McpElicitationHandlers {
  /**
   * Absent when there is no window to ask in. Every mode then declines,
   * including URL mode — a windowless app must not let a server open a browser.
   */
  promptUser?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
  openExternal: (url: string) => void;
  /** Consulted only for form mode, and only by providers that prompt on every MCP tool call. */
  autoApprove?: (serverName: string) => boolean;
}

/**
 * Claude already auto-allows configured MCP tools, so Codex is the only chat
 * provider that would otherwise prompt on every browser step.
 */
export function isAutoApprovedCodexMcpServer(serverName: unknown): boolean {
  return typeof serverName === 'string' && serverName.toLowerCase() === 'playwright';
}

/**
 * Never throws: a handler that rejects declines, because an unanswered
 * elicitation leaves the MCP server waiting until it times out.
 */
export async function decideMcpElicitation(
  request: McpElicitationRequest,
  handlers: McpElicitationHandlers,
): Promise<McpElicitationDecision> {
  const { promptUser, openExternal, autoApprove } = handlers;
  if (!promptUser) return { action: 'decline' };

  try {
    if (request.mode === 'url') {
      const url = typeof request.url === 'string' ? request.url : '';
      if (!isAllowedExternalUrl(url)) {
        console.warn(`[McpElicitation] Blocked unsafe MCP elicitation URL: ${url}`);
        return { action: 'decline' };
      }
      openExternal(url);
      return { action: 'accept', content: {} };
    }

    const serverName = typeof request.serverName === 'string' ? request.serverName : 'unknown';
    if (autoApprove?.(serverName)) return { action: 'accept', content: {} };

    const allowed = await promptUser(`mcp_elicitation:${serverName}`, {
      message: request.message,
      mode: request.mode,
    });
    return allowed ? { action: 'accept', content: {} } : { action: 'decline' };
  } catch (error) {
    console.warn('[McpElicitation] Declining elicitation after handler failure:', error);
    return { action: 'decline' };
  }
}
