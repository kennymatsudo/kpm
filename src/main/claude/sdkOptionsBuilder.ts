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
  /** Returns pending content for a project-relative path so same-file edits accumulate */
  peekPendingFile?: (relativeFilePath: string) => string | undefined;
  /** External plugin paths to load (for non-managed MCP servers) */
  enabledPluginPaths?: string[];
  /** User MCP server configs to load (from ~/.claude.json) */
  enabledUserMcpConfigs?: Record<string, Record<string, unknown>>;
  /** Tool names to disallow (for disabled managed MCP servers) */
  disabledMcpTools?: string[];
  /** Server names to deny in canUseTool (for disabled managed MCP servers) */
  disabledMcpServerNames?: string[];
  /** Callback for MCP elicitation requests (auth flows, form input) */
  onElicitation?: OnElicitation;
  /** When true, skip permission prompts and auto-allow all non-denied tool calls */
  autoApprove?: boolean;
}

/**
 * Build SDK options for a Claude session.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SDKOptions {
  const { context, model, effort, currentView, resumeSessionId, mainWindow, onClaudeMdEdit, onProjectFileWrite, peekPendingFile, enabledPluginPaths, enabledUserMcpConfigs, disabledMcpTools, disabledMcpServerNames, onElicitation, autoApprove } = params;
  const effectiveRepoPaths = context.repos.map(r => r.active_worktree_path ?? r.path);

  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    repoPaths: effectiveRepoPaths,
    currentView,
    onClaudeMdEdit,
    onProjectFileWrite,
    peekPendingFile,
    disabledMcpServerNames,
    autoApprove,
  };

  // Get MCP server

  // Build options
  const claudeConfig = getConfig().claude;
  const sdkOptions: SDKOptions = {
    systemPrompt,
    model,
    cwd: context.project.folder_path ?? context.repos[0]?.active_worktree_path ?? context.repos[0]?.path,
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
    // Load user settings so claude.ai managed MCP servers (Whimsical, Glean, etc.) connect.
    // KPM's canUseTool handler takes precedence over any permission grants in settings.json.
    mcpServers: {
      kpm: kpmServer,
      // Merge in user-configured MCP servers (from ~/.claude.json)
    },
    // Load user-enabled external MCP plugins (Slack, GitHub, etc.)
      plugins: enabledPluginPaths.map(p => ({ type: 'local' as const, path: p })),
    }),
    // Always disable the built-in option-picker tool; Claude asks clarifying
    // questions in plain text instead.
    // Disable built-in task-tracking tools (TaskCreate, TaskGet, etc.): grounded
    // chat sessions are overwhelmingly single-deliverable research or document
    // edits, and the SDK injects a recurring "use task tools" system reminder
    // whenever these are enabled. KPM's own plan tools cover multi-step tracking.
    // Also disable any managed MCP tools the user has turned off.
    disallowedTools: [
      'AskUserQuestion',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskOutput',
      'TaskStop',
      'TaskUpdate',
      ...(disabledMcpTools ?? []),
    ],
    maxTurns: claudeConfig.maxTurns,
    // Periodic AI-generated progress summaries for Task-tool subagents.
    // Forks the subagent every ~30s and emits a short description on
    // `task_progress.summary`; reuses the prompt cache, so cost is minimal.
    // Read-only exploration subagent. Routes file/symbol/pattern searches
    // off the main conversation so file contents never enter the parent's
    // context — only the summary returns. Sonnet (not Haiku) because the
    // Haiku Explore subagent has a documented context-overflow failure in
    // MCP-heavy setups (anthropics/claude-code#45357); Sonnet is still ~5x
    // cheaper than Opus on cache_read.
      explorer: {
        description:
          'Use proactively for any read-heavy task: codebase exploration (finding ' +
          'files, searching for symbols, locating definitions, "where is X"), and ' +
          'reading lengthy documents (specs, design docs, iteration docs, README, ' +
          'external web pages). The subagent works in an isolated context and ' +
          'returns a concise summary — large file or document content never enters ' +
          'this conversation. Do NOT use for code review, multi-file design ' +
          'reasoning, or anything requiring the main conversation\'s context.',
        prompt:
          'You are a fast, read-only research agent. Locate or read what is ' +
          'requested, then return a concise summary with file:line citations or ' +
          'section anchors. Do not include large file excerpts — synthesize and ' +
          'quote selectively. Do not propose changes. If you cannot find or access ' +
          'what was asked, say so explicitly rather than guessing.',
        tools: ['Read', 'Grep', 'Glob', 'WebFetch'],
        model: 'sonnet',
        maxTurns: 50,
      },
    // Effort level: guides how much thinking Claude applies (works with adaptive thinking)
    ...(effort && { effort }),
    // Fallback to Sonnet if the primary model is unavailable (e.g., rate limited)
    ...(model === 'opus' && { fallbackModel: 'sonnet' }),
    ...(resumeSessionId && { resume: resumeSessionId }),
    ...(claudeConfig.debug && { debug: true }),
    ...(claudeConfig.debug && claudeConfig.debugFile && { debugFile: claudeConfig.debugFile }),
    // Handle MCP elicitation requests (auth flows, form inputs from managed servers)
    ...(onElicitation && { onElicitation }),
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
  };

  // Add connected repos as accessible directories
  if (context.repos.length > 0) {
    sdkOptions.additionalDirectories = effectiveRepoPaths;
  }

  return sdkOptions;
}
