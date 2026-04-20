/**
 * SDK Options builder for Claude sessions.
 *
 * Builds the Options object needed for the Claude SDK query() function.
 * This is used by both the per-query and streaming session patterns.
 */

import type { Options as SDKOptions, OnElicitation } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserWindow } from 'electron';
import type { ChatViewMode } from '../../shared/types';
import { createPermissionHandler, type PermissionContext, type ClaudeMdInterceptFn, type ProjectFileInterceptFn } from './permissions';
import { getConfig } from '../config';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { promptUser } from '../services/core/PermissionPromptService';

export type ModelType = 'opus' | 'sonnet' | 'haiku';

export interface BuildSdkOptionsParams {
  context: PlanContext;
  model: ModelType;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  currentView?: ChatViewMode;
  resumeSessionId?: string;
  mainWindow: BrowserWindow | null;
  /** Callback for intercepted project context file edits */
  onClaudeMdEdit?: ClaudeMdInterceptFn;
  /** Callback for intercepted project file writes */
  onProjectFileWrite?: ProjectFileInterceptFn;
  /** External plugin paths to load (for non-managed MCP servers) */
  enabledPluginPaths?: string[];
  /** User MCP server configs to load (from ~/.claude.json) */
  enabledUserMcpConfigs?: Record<string, Record<string, unknown>>;
  /** Tool names to disallow (for disabled managed MCP servers) */
  disabledMcpTools?: string[];
  /** Callback for MCP elicitation requests (auth flows, form input) */
  onElicitation?: OnElicitation;
  /** When true, skip permission prompts and auto-allow all non-denied tool calls */
  autoApprove?: boolean;
}

/**
 * Build SDK options for a Claude session.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SDKOptions {

  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    currentView,
    onClaudeMdEdit,
    onProjectFileWrite,
    autoApprove,
  };

  // Get MCP server

  // Build options
  const claudeConfig = getConfig().claude;
  const sdkOptions: SDKOptions = {
    systemPrompt,
    model,
    // Pin the bundled native Claude binary so the SDK skips its own PATH lookup.
    // See findClaude.ts for platform-specific resolution details.
    ...getClaudeSdkSpawnOptions(),
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
      // Merge in user-configured MCP servers (from ~/.claude.json)
    },
    // Load user-enabled external MCP plugins (Slack, GitHub, etc.)
      plugins: enabledPluginPaths.map(p => ({ type: 'local' as const, path: p })),
    }),
    maxTurns: claudeConfig.maxTurns,
    // Effort level: guides how much thinking Claude applies (works with adaptive thinking)
    ...(effort && { effort }),
    // Fallback to Sonnet if the primary model is unavailable (e.g., rate limited)
    ...(model === 'opus' && { fallbackModel: 'sonnet' }),
    ...(resumeSessionId && { resume: resumeSessionId }),
    ...(claudeConfig.debug && { debug: true }),
    ...(claudeConfig.debug && claudeConfig.debugFile && { debugFile: claudeConfig.debugFile }),
    // Handle MCP elicitation requests (auth flows, form inputs from managed servers)
    ...(onElicitation && { onElicitation }),
  };

  // Add connected repos as accessible directories
  if (context.repos.length > 0) {
  }

  return sdkOptions;
}
