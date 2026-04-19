import {
  JiraClient,
  LinearClient,
  KeytarCredentialProvider,
  type TrackerClient,
  type TrackerType,
} from '../tracker-clients';

const provider = new KeytarCredentialProvider();

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

  // ---- Jira ---------------------------------------------------------------

  async getJiraClient(): Promise<JiraClient> {
    const creds = await provider.getCredentials('jira');
    if (!creds) {
      throw new Error('No Jira credentials configured');
    }
    return new JiraClient(creds);
  },

  async testJiraConnection(
    siteUrl: string,
    email: string,
    apiToken: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = new JiraClient({ type: 'jira', siteUrl, email, apiToken });
    return client.testConnection();
  },

  async saveJiraCredentials(
    siteUrl: string,
    email: string,
    apiToken: string
  ): Promise<{ success: boolean; error?: string }> {
    const testResult = await this.testJiraConnection(siteUrl, email, apiToken);
    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }
    try {
      await provider.saveCredentials({ type: 'jira', siteUrl, email, apiToken });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
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

  async clearJiraCredentials(): Promise<void> {
    await provider.clearCredentials('jira');
  },

  // ---- Linear -------------------------------------------------------------

  async getLinearClient(): Promise<LinearClient> {
    const creds = await provider.getCredentials('linear');
    if (!creds) {
      throw new Error('No Linear credentials configured');
    }
    return new LinearClient(creds);
  },

  async testLinearConnection(apiToken: string): Promise<{ success: boolean; error?: string }> {
    const client = new LinearClient({ type: 'linear', apiToken });
    return client.testConnection();
  },

  async saveLinearCredentials(apiToken: string): Promise<{ success: boolean; error?: string }> {
    const testResult = await this.testLinearConnection(apiToken);
    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }
    try {
      await provider.saveCredentials({ type: 'linear', apiToken });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
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

  async clearLinearCredentials(): Promise<void> {
    await provider.clearCredentials('linear');
  },
};
