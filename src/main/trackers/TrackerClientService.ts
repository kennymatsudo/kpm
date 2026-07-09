import {
  JiraClient,
  LinearClient,
  KeytarCredentialProvider,
  type TrackerClient,
  type TrackerCredentials,
  type TrackerType,
} from '../tracker-clients';

const provider = new KeytarCredentialProvider();

function createClientForCredentials(creds: TrackerCredentials): TrackerClient {
  if (creds.type === 'jira') return new JiraClient(creds);
  return new LinearClient(creds);
}

export interface JiraCredentialsInfo {
  configured: true;
  siteUrl: string;
  email: string;
}

export interface LinearCredentialsInfo {
  configured: true;
}

/**
 * Service for managing tracker clients.
 * Handles authentication, client creation, and validation for all supported
 * trackers (Jira, Linear).
 */
export const TrackerClientService = {
  /**
   * Get a tracker client for the given type using stored credentials.
   * @throws Error if no credentials are configured for the type
   */
  async getClient(type: TrackerType): Promise<TrackerClient> {
    if (type === 'jira') return this.getJiraClient();
    return this.getLinearClient();
  },

  // ---- Credentials --------------------------------------------------------

  async testConnection(creds: TrackerCredentials): Promise<{ success: boolean; error?: string }> {
    const client = createClientForCredentials(creds);
    return client.testConnection();
  },

  async saveCredentials(creds: TrackerCredentials): Promise<{ success: boolean; error?: string }> {
    const testResult = await this.testConnection(creds);
    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }
    try {
      await provider.saveCredentials(creds);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
  },

  async clearCredentials(type: TrackerType): Promise<void> {
    await provider.clearCredentials(type);
  },

  // ---- Jira ---------------------------------------------------------------

  async getJiraClient(): Promise<JiraClient> {
    const creds = await provider.getCredentials('jira');
    if (!creds) {
      throw new Error('No Jira credentials configured');
    }
    return new JiraClient(creds);
  },

  async getJiraProjects(): Promise<{
    success: boolean;
    projects?: { key: string; name: string }[];
    error?: string;
  }> {
    try {
      const client = await this.getJiraClient();
      const projects = await client.getAvailableProjects();
      return { success: true, projects };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to fetch projects' };
    }
  },

  async hasJiraCredentials(): Promise<boolean> {
    return provider.hasCredentials('jira');
  },

  async getJiraCredentialsInfo(): Promise<JiraCredentialsInfo | null> {
    const creds = await provider.getCredentials('jira');
    if (!creds) return null;
    return { configured: true, siteUrl: creds.siteUrl, email: creds.email };
  },

  // ---- Linear -------------------------------------------------------------

  async getLinearClient(): Promise<LinearClient> {
    const creds = await provider.getCredentials('linear');
    if (!creds) {
      throw new Error('No Linear credentials configured');
    }
    return new LinearClient(creds);
  },

  async getLinearTeams(): Promise<{
    success: boolean;
    teams?: { key: string; name: string }[];
    error?: string;
  }> {
    try {
      const client = await this.getLinearClient();
      const teams = await client.getAvailableProjects();
      return { success: true, teams };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to fetch Linear teams' };
    }
  },

  async hasLinearCredentials(): Promise<boolean> {
    return provider.hasCredentials('linear');
  },

  async getLinearCredentialsInfo(): Promise<LinearCredentialsInfo | null> {
    const creds = await provider.getCredentials('linear');
    if (!creds) return null;
    return { configured: true };
  },

};
