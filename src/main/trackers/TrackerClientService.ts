import {
  JiraClient,
  KeytarCredentialProvider,
} from '../tracker-clients';

const provider = new KeytarCredentialProvider();

/**
 * Service for managing tracker clients.
 */
export const TrackerClientService = {
  /**
   */
  async getJiraClient(): Promise<JiraClient> {
    const creds = await provider.getCredentials('jira');
    if (!creds) {
      throw new Error('No Jira credentials configured');
    }
    return new JiraClient(creds);
  },

    return client.testConnection();
  },

    const testResult = await this.testJiraConnection(siteUrl, email, apiToken);
    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }
    try {
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save credentials' };
    }
  },

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

    const creds = await provider.getCredentials('jira');
    if (!creds) return null;
  },

  async clearJiraCredentials(): Promise<void> {
    await provider.clearCredentials('jira');
  },
};
