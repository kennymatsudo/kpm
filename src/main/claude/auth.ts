/**
 * Anthropic API key management using OS keychain.
 */

import keytar from 'keytar';

// Keep the legacy keychain service name so existing API keys remain readable.
const SERVICE = 'KPM';
const ACCOUNT = 'anthropic-api-key';

export const AnthropicAuth = {
  /**
   * Save Anthropic API key to OS keychain.
   */
  async saveApiKey(apiKey: string): Promise<void> {
    await keytar.setPassword(SERVICE, ACCOUNT, apiKey);
  },

  /**
   * Get Anthropic API key from OS keychain.
   */
  async getApiKey(): Promise<string | null> {
    return keytar.getPassword(SERVICE, ACCOUNT);
  },

  /**
   * Check if Anthropic API key exists.
   */
  async hasApiKey(): Promise<boolean> {
    const key = await keytar.getPassword(SERVICE, ACCOUNT);
    return key !== null;
  },

  /**
   * Delete Anthropic API key from OS keychain.
   */
  async deleteApiKey(): Promise<void> {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  },

  /**
   * Set API key in environment for SDK to use.
   * Call this before using the Claude SDK.
   */
  async setEnvironment(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey;
      return true;
    }
    return false;
  },
};
