import keytar from 'keytar';
import type { TrackerType, TrackerCredentials } from '../types.js';

const SERVICE = 'KPM';

export class KeytarCredentialProvider implements CredentialProvider {
  private accountKey(type: TrackerType): string {
    return `${type}-credentials`;
  }

    const stored = await keytar.getPassword(SERVICE, this.accountKey(type));
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
