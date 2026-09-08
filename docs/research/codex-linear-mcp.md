# Codex Chat and Linear MCP

## Decision

Do **not** try to reuse Claude's managed Linear MCP authentication in Codex.
The server endpoint can be shared, but its configured client and OAuth credentials
belong to the client that completed that flow. Configure Linear for Codex and let
Codex authenticate it, or deliberately provide a separate bearer credential.

## What is supported

- Codex supports local **STDIO** and remote **Streamable HTTP** MCP servers. Remote
  servers support bearer-token and OAuth authentication, including CIMD and dynamic
  client registration. Codex clients share `~/.codex/config.toml` on the same host;
  that sharing is between Codex Desktop, CLI, and IDE, not Claude. [OpenAI MCP
  documentation](https://learn.chatgpt.com/docs/extend/mcp)
- Linear's official remote MCP endpoint is `https://mcp.linear.app/mcp`. It uses
  Streamable HTTP and interactive OAuth 2.1 with dynamic client registration.
  Linear documents Codex setup as `codex mcp add linear --url
  https://mcp.linear.app/mcp`, then a Codex login when required. [Linear MCP
  documentation](https://linear.app/docs/mcp)
- Linear explicitly allows a deliberate `Authorization: Bearer <token>` setup,
  using either a Linear API key or a token from an existing Linear OAuth app. This
  is credential sharing by the user/application, not an import of Claude's private
  auth state. [Linear MCP documentation](https://linear.app/docs/mcp)

## Why Claude authentication cannot be inherited

There is no documented Claude-to-Codex config or credential migration. Codex's
documented shared configuration scope excludes Claude, and Linear's normal OAuth
flow binds the authorization to a client ID and redirect URI. Linear access tokens
expire after 24 hours and refresh tokens rotate, so copying an opaque token store
would also be brittle and unsafe. [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp)
[Linear OAuth documentation](https://linear.app/developers/oauth-2-0-authentication)

## KPM architecture

1. **Keep provider boundaries explicit.** Continue discovering Claude plugins and
   `~/.claude.json` only for Claude. Add a Codex-specific source for servers in
   Codex configuration, or let Codex's native configuration remain the source of
   truth. Do not read, copy, or persist Claude managed OAuth credentials.
2. **Pass through Codex-configured servers.** The current `CodexChatSession` uses
   the Codex SDK, which starts the Codex CLI and supplies targeted `--config`
   overrides for KPM's own server. The SDK documentation describes these as
   additional overrides, while KPM preserves the process environment. Therefore a
   Linear server configured in `~/.codex/config.toml` is the lowest-risk initial
   path; KPM only needs to make its availability and failures visible.
3. **Provide a KPM setup action only if needed.** It should add the Linear URL to
   the *Codex* configuration and launch Codex's own OAuth login. The SDK has no
   OAuth approval/callback API, so KPM must not pretend it can complete or store
   that flow itself without a separate, tested native-CLI integration.
4. **Default to read-only.** Use Linear's `/mcp/readonly` endpoint, or request only
   Linear's `read` scope on `/mcp`. Both prevent write tools; enable a write-capable
   connection only after an explicit setting and clear UI warning. [Linear MCP
   documentation](https://linear.app/docs/mcp)

## Constraints and risks

- **Current KPM gap:** `McpDiscoveryService` only reads Claude plugins,
  `~/.claude.json`, and `claude mcp list`; `CodexChatSession` currently declares
  only KPM's injected server. KPM has no Codex-MCP discovery, status, OAuth-login,
  or per-server enablement surface.
- **Approval gap:** KPM runs Codex with `approvalPolicy: 'never'`. Any external
  MCP server that exposes write tools needs its own conservative approval setting
  and KPM must preserve the project's chat-write-consent invariant rather than
  treating a Linear mutation as harmless.
- **No secret migration:** never inspect Claude credential files or move tokens
  into KPM settings. If a bearer-token route is added, use platform secure storage,
  request the smallest scope, support revocation, and never log it.
- **Validate on the bundled version:** Linear currently notes that first-time Codex
  users may need `experimental_use_rmcp_client = true`. Verify the packaged Codex
  binary before exposing the setup flow. [Linear MCP documentation](https://linear.app/docs/mcp)

## Recommended first release

Ship **Codex-native configuration plus Codex-owned OAuth**, beginning with Linear
read-only. Detect and show the configured server in KPM, but leave credentials in
Codex's credential store. Add write access only after KPM can enforce a clear,
per-call consent policy for external MCP mutations.
