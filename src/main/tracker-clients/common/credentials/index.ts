
export interface CredentialProvider {
  saveCredentials(creds: TrackerCredentials): Promise<void>;
  hasCredentials(type: TrackerType): Promise<boolean>;
  clearCredentials(type: TrackerType): Promise<void>;
}

