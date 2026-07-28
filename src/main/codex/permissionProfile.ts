import type { CodexOptions } from '@openai/codex-sdk';

export const CODEX_READ_PROFILE = 'kpm-chat-read';
export const CODEX_WRITE_PROFILE = 'kpm-chat-write';

function pathPermissionKey(profileName: string, path: string): string {
  return `permissions.${profileName}.filesystem.${JSON.stringify(path)}`;
}

export function buildCodexPermissionConfig(
  writesEnabled: boolean,
  deniedPathRoots: readonly string[],
): NonNullable<CodexOptions['config']> {
  const profileName = writesEnabled ? CODEX_WRITE_PROFILE : CODEX_READ_PROFILE;
  const config: NonNullable<CodexOptions['config']> = {
    default_permissions: profileName,
    [`permissions.${profileName}.filesystem.":root"`]: writesEnabled ? 'write' : 'read',
    [`permissions.${profileName}.network.enabled`]: false,
  };

  for (const deniedPathRoot of deniedPathRoots) {
    config[pathPermissionKey(profileName, deniedPathRoot)] = 'deny';
  }

  return config;
}

function toTomlLiteral(value: string | number | boolean): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function codexConfigOverrideArgs(
  config: NonNullable<CodexOptions['config']>,
): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (
      typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      throw new Error(`Codex sandbox config "${key}" must be a scalar value`);
    }
    args.push('-c', `${key}=${toTomlLiteral(value)}`);
  }
  return args;
}
