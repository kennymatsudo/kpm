export function listAvailableMcpServers() {
  return window.api.mcpServers.listAvailable();
}

export function getMcpServerPreferences() {
  return window.api.mcpServers.getPreferences();
}

export function setMcpServerEnabled(serverKey: string, enabled: boolean) {
  return window.api.mcpServers.setEnabled({ serverName: serverKey, enabled });
}
