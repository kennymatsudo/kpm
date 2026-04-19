import keytar from 'keytar';
import type { TrackerType, TrackerCredentials } from '../types.js';
import type { CredentialProvider, CredentialOfType } from './index.js';

const SERVICE = 'KPM';

export class KeytarCredentialProvider implements CredentialProvider {
  private accountKey(type: TrackerType): string {
    return `${type}-credentials`;
  }

  async getCredentials<T extends TrackerType>(type: T): Promise<CredentialOfType<T> | null> {
    const stored = await keytar.getPassword(SERVICE, this.accountKey(type));
    return stored ? (JSON.parse(stored) as CredentialOfType<T>) : null;
  }

  async saveCredentials(creds: TrackerCredentials): Promise<void> {
    await keytar.setPassword(SERVICE, this.accountKey(creds.type), JSON.stringify(creds));
  }

  async hasCredentials(type: TrackerType): Promise<boolean> {
    return (await keytar.getPassword(SERVICE, this.accountKey(type))) !== null;
  }

  async clearCredentials(type: TrackerType): Promise<void> {
    await keytar.deletePassword(SERVICE, this.accountKey(type));
  }
}
