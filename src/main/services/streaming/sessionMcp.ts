/**
 * The shape a chat session reports its MCP servers in, owned here rather than
 * by either provider SDK.
 *
 * Both Claude and Codex can list and reload their servers; only Codex can
 * start an OAuth login. Modelling that as one optional method per capability
 * — instead of a set of provider-named methods — is what lets a third provider
 * expose the same surface without a new IPC endpoint, a new renderer branch,
 * and a fourth copy of this record.
 */

/**
 * The union of what the providers actually report. Codex only ever produces
 * the first three; Claude adds the last two, and losing them would hide a
 * server that is configured but unusable.
 */
export type SessionMcpConnectionStatus =
  | 'connected'
  | 'pending'
  | 'failed'
  | 'needs-auth'
  | 'disabled';

export type SessionMcpAuthStatus =
  | 'unknown'
  | 'unsupported'
  | 'notLoggedIn'
  | 'bearerToken'
  | 'oAuth';

export interface SessionMcpServer {
  name: string;
  status: SessionMcpConnectionStatus;
  authStatus: SessionMcpAuthStatus;
  error?: string;
}

export interface SessionMcpInspection {
  list(): Promise<SessionMcpServer[]>;
  /** Reloads every configured server, or just one when the provider can target it. */
  reload(serverName?: string): Promise<void>;
  /** Returns an authorization URL for the caller to open. Absent when the provider has no OAuth flow. */
  beginLogin?(serverName: string): Promise<string>;
}
