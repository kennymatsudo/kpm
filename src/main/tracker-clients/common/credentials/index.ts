import type { TrackerType, TrackerCredentials } from '../types';

/**
 * Generic helper that narrows TrackerCredentials by the type key.
 * `CredentialOfType<'jira'>` = `JiraCredentials`.
 */
export type CredentialOfType<T extends TrackerType> = Extract<TrackerCredentials, { type: T }>;

export interface CredentialProvider {
  getCredentials<T extends TrackerType>(type: T): Promise<CredentialOfType<T> | null>;
  saveCredentials(creds: TrackerCredentials): Promise<void>;
  hasCredentials(type: TrackerType): Promise<boolean>;
  clearCredentials(type: TrackerType): Promise<void>;
}

export { KeytarCredentialProvider } from './keytar-provider';
