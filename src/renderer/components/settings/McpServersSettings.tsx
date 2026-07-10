import { useEffect } from 'react';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useChatStore, useMcpServersStore } from '../../stores';
import { getProviderCapabilities } from '../../../shared/providerCapabilities';

export function McpServersSettings() {
  const provider = useChatStore((state) => state.provider);
  const capabilities = getProviderCapabilities(provider);
  const {
    plugins,
    userServers,
    managedServers,
    preferences,
    isLoading,
    togglingServerName,
    error,
    loadServers,
    setServerEnabled,
  } = useMcpServersStore();

  useEffect(() => {
    if (!capabilities.mcpServerManagement) return;
    void loadServers();
  }, [capabilities.mcpServerManagement, loadServers]);

  const enabledPlugins = plugins.filter(p => p.enabledInClaudeCode);

  // Sort managed servers: connected first, then alphabetical within each group
  const sortedManagedServers = [...managedServers].sort((a, b) => {
    if (a.status === 'connected' && b.status !== 'connected') return -1;
    if (a.status !== 'connected' && b.status === 'connected') return 1;
    return a.name.localeCompare(b.name);
  });

  const hasManagedServers = managedServers.length > 0;
  const hasUserServers = userServers.length > 0;
  const hasPlugins = enabledPlugins.length > 0;
  const hasAnything = hasManagedServers || hasUserServers || hasPlugins;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-text-primary">MCP Servers</h3>
        <p className="text-sm text-text-secondary mt-1">
          Choose which MCP servers are available in new chat sessions.
        </p>
      </div>

      {!capabilities.mcpServerManagement && (
        <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
          <p className="text-sm text-text-secondary">
            MCP server management is not available for the selected chat provider.
          </p>
        </div>
      )}

      {capabilities.mcpServerManagement && error && (
        <div className="p-3 rounded-xl bg-danger-muted/50 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {capabilities.mcpServerManagement && (isLoading ? (
        <div className="flex items-center gap-2 py-3">
          <LoadingSpinner className="w-4 h-4 text-text-muted" />
          <p className="text-text-secondary text-sm">Discovering servers...</p>
        </div>
      ) : !hasAnything ? (
        <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
          <p className="text-sm text-text-secondary">
            No MCP servers found. Connect integrations in your claude.ai account
            or configure servers via <code className="text-xs bg-surface-3 px-1 py-0.5 rounded">claude mcp add</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Section 1: claude.ai Managed Servers */}
          {hasManagedServers && (
            <ServerSection
              title="Connected (claude.ai)"
              description="Synced from your claude.ai account."
              icon={<CloudIcon />}
            >
              {sortedManagedServers.map(server => (
                <ManagedServerRow
                  key={server.name}
                  name={server.name}
                  status={server.status}
                />
              ))}
            </ServerSection>
          )}

          {/* Section 2: User MCP Servers */}
          {hasUserServers && (
            <ServerSection
              title="User Servers"
              description={<>Configured via <code className="text-xs bg-surface-3 px-1 py-0.5 rounded">claude mcp add</code>.</>}
              icon={<UserIcon />}
            >
              {userServers.map(server => (
                <ToggleableServerRow
                  key={server.name}
                  name={server.name}
                  detail={server.type}
                  isEnabled={preferences[`user:${server.name}`] === true}
                  isToggling={togglingServerName === `user:${server.name}`}
                  onToggle={(enabled) => void setServerEnabled(`user:${server.name}`, enabled)}
                />
              ))}
            </ServerSection>
          )}

          {/* Section 3: Plugins */}
          {hasPlugins && (
            <ServerSection
              title="Plugins"
              description="Installed Claude Code plugins."
              icon={<PlugIcon />}
            >
              {enabledPlugins.map(plugin => (
                <ToggleableServerRow
                  key={plugin.name}
                  name={plugin.name}
                  detail={plugin.description}
                  isEnabled={preferences[plugin.name] === true}
                  isToggling={togglingServerName === plugin.name}
                  onToggle={(enabled) => void setServerEnabled(plugin.name, enabled)}
                />
              ))}
            </ServerSection>
          )}
        </div>
      ))}

      {/* Info note */}
      {capabilities.mcpServerManagement && (
        <p className="text-xs text-text-muted">
          External MCP tool calls require approval before they run.
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Shared Components
// =============================================================================

function ServerSection({ title, description, icon, children }: {
  title: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted">{icon}</span>
        <h4 className="text-sm font-medium text-text-primary">{title}</h4>
      </div>
      <p className="text-xs text-text-secondary mb-2">{description}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** Read-only row for managed servers — shows status, no toggle */
function ManagedServerRow({ name, status }: {
  name: string;
  status: string;
}) {
  const displayName = name.replace(/^claude\.ai\s+/, '');
  return (
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-primary">{displayName}</span>
      <StatusBadge status={status} />
    </div>
  );
}

/** Toggleable row for user servers and plugins */
function ToggleableServerRow({ name, detail, isEnabled, isToggling, onToggle }: {
  name: string;
  detail?: string;
  isEnabled: boolean;
  isToggling: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm font-medium text-text-primary">{name}</span>
        {detail && (
          <span className="text-xs text-text-muted ml-2">{detail}</span>
        )}
      </div>
      <button
        onClick={() => onToggle(!isEnabled)}
        disabled={isToggling}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
          isEnabled ? 'bg-accent' : 'bg-surface-3'
        } ${isToggling ? 'opacity-50' : ''}`}
        aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${name}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            isEnabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isConnected = status === 'connected';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
      isConnected
        ? 'bg-success-muted text-success'
        : 'bg-surface-3 text-text-muted'
    }`}>
      {isConnected ? 'connected' : status === 'needs-auth' ? 'needs re-auth' : status}
    </span>
  );
}

// =============================================================================
// Icons
// =============================================================================

function CloudIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
