/**
 * SDK Options builder for Claude sessions.
 *
 * Builds the Options object needed for the Claude SDK query() function.
 * This is used by both the per-query and streaming session patterns.
 */

import type { ChatViewMode } from '../../shared/types';
import { createPermissionHandler, type PermissionContext, type ClaudeMdInterceptFn, type ProjectFileInterceptFn } from './permissions';
import { getConfig } from '../config';

export type ModelType = 'opus' | 'sonnet' | 'haiku';

export interface BuildSdkOptionsParams {
  context: PlanContext;
  model: ModelType;
  currentView?: ChatViewMode;
  resumeSessionId?: string;
  mainWindow: BrowserWindow | null;
  onClaudeMdEdit?: ClaudeMdInterceptFn;
  /** Callback for intercepted project file writes */
  onProjectFileWrite?: ProjectFileInterceptFn;
}

/**
 * Build SDK options for a Claude session.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SDKOptions {

  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    onClaudeMdEdit,
    onProjectFileWrite,
  };

  // Get MCP server

  // Build options
  const claudeConfig = getConfig().claude;
  const sdkOptions: SDKOptions = {
    systemPrompt,
    model,
    canUseTool: createPermissionHandler(permissionContext, async (toolName, input, opts) => {
      return promptUser(mainWindow, permissionContext.projectId, toolName, input, {
        signal: opts.signal,
        title: opts.title,
        displayName: opts.displayName,
        description: opts.description,
      });
    }),
    mcpServers: {
      kpm: kpmServer,
    },
    maxTurns: claudeConfig.maxTurns,
    ...(resumeSessionId && { resume: resumeSessionId }),
    ...(claudeConfig.debug && { debug: true }),
    ...(claudeConfig.debug && claudeConfig.debugFile && { debugFile: claudeConfig.debugFile }),
  };

  // Add connected repos as accessible directories
  if (context.repos.length > 0) {
  }

  return sdkOptions;
}
