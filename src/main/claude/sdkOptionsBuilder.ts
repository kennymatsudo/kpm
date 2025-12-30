/**
 * SDK Options builder for Claude sessions.
 *
 * Builds the Options object needed for the Claude SDK query() function.
 * This is used by both the per-query and streaming session patterns.
 */

import { getConfig } from '../config';

export type ModelType = 'opus' | 'sonnet' | 'haiku';

export interface BuildSdkOptionsParams {
  model: ModelType;
  resumeSessionId?: string;
  mainWindow: BrowserWindow | null;
  onClaudeMdEdit?: ClaudeMdInterceptFn;
}

/**
 * Build SDK options for a Claude session.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SDKOptions {

  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    onClaudeMdEdit,
  };

  // Get MCP server

  // Build options
  const claudeConfig = getConfig().claude;
  const sdkOptions: SDKOptions = {
    systemPrompt,
    model,
    canUseTool: createPermissionHandler(permissionContext, async (toolName, input, opts) => {
    }),
    mcpServers: {
      kpm: kpmServer,
    },
    ...(resumeSessionId && { resume: resumeSessionId }),
  };

  // Add connected repos as accessible directories
  if (context.repos.length > 0) {
  }

  return sdkOptions;
}
