import { resolveSettings, type Options } from '@anthropic-ai/claude-agent-sdk';

export type PermissionModeOptions = Pick<Options, 'permissionMode' | 'allowDangerouslySkipPermissions'>;

/**
 * The permission mode from the user's own Claude Code settings, as SDK
 * options. The SDK starts every session in 'default' and ignores
 * `permissions.defaultMode`, so KPM reads it and passes it on. Only user
 * settings are read, matching `settingSources: ['user']`.
 */
export async function userPermissionModeOptions(): Promise<PermissionModeOptions> {
  let mode: Options['permissionMode'];
  try {
    mode = (await resolveSettings({ settingSources: ['user'] })).effective.permissions?.defaultMode;
  } catch (error) {
    console.warn('[Claude] Could not read the Claude Code permission mode, using default:', error);
    return {};
  }
  if (!mode) return {};
  return { permissionMode: mode, ...(mode === 'bypassPermissions' && { allowDangerouslySkipPermissions: true }) };
}
