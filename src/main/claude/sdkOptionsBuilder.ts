/**
 * SDK Options builder for Claude sessions.
 *
 * Builds the Options object needed for the Claude SDK query() function.
 * This is used by both the per-query and streaming session patterns.
 */

import type { Options as SDKOptions, OnElicitation } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserWindow } from 'electron';
import { buildFocusSystemPrompt, buildSystemPrompt, type PlanContext } from '../chat/prompts/index';
import { createPermissionHandler, type PermissionContext, type ContextFileInterceptFn, type ProjectFileInterceptFn } from './permissions';
import { getFocusKpmServer, getKpmServer } from '../kpmTools/createKpmServer';
import { getConfig } from '../config';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { promptUser } from '../services/core/PermissionPromptService';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';

export type ModelType = 'opus' | 'sonnet' | 'haiku';

export interface BuildSdkOptionsParams {
  context: PlanContext;
  model: ModelType;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  resumeSessionId?: string;
  mainWindow: BrowserWindow | null;
  /** Callback for intercepted project context file edits */
  onContextFileEdit?: ContextFileInterceptFn;
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
  const { context, model, effort, resumeSessionId, mainWindow, onContextFileEdit, onProjectFileWrite, peekPendingFile, enabledPluginPaths, enabledUserMcpConfigs, disabledMcpTools, disabledMcpServerNames, onElicitation, autoApprove } = params;
  // Resume restores conversation history only — the SDK applies whatever
  // systemPrompt we pass now and discards the one persisted in the transcript.
  // So always send the full prompt; slimming it on resume silently drops
  // RESPONSE_STYLE, constraints, grounding, the tool tree, and plan rules on
  // every post-idle turn. Prompt caching absorbs the cost (a 30-min idle has
  // already expired the cache TTL).
  const isFocusSession = !!context.focusDocument;
  const systemPrompt = isFocusSession ? buildFocusSystemPrompt(context) : buildSystemPrompt(context);
  const effectiveRepoPaths = context.repos.map(resolveEffectiveRepoPath);

  // Create permission handler. canUseTool scopes file access (repos read-only,
  // project-file writes intercepted) and gates external MCP servers. It does
  // NOT gate KPM tools by view — all KPM tools are callable in both plan and
  // workspace views.
  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    repoPaths: effectiveRepoPaths,
    onContextFileEdit,
    onProjectFileWrite,
    peekPendingFile,
    disabledMcpServerNames,
    autoApprove,
  };

  // Get MCP server
  const kpmServer = isFocusSession ? getFocusKpmServer() : getKpmServer();

  // Build options
  const claudeConfig = getConfig().claude;
  const sdkOptions: SDKOptions = {
    // `tools: ['default']` selects the native binary's full built-in preset.
    // 'default' only expands to the preset when it is the sole value: adding
    // names (e.g. ['default','Grep','Glob']) turns the array into an explicit
    // allowlist where 'default' is an unknown no-op, collapsing the built-in set
    // to just the listed names and silently dropping Bash/WebSearch/Read/Edit/etc.
    // Native builds omit Grep/Glob from the preset in favor of shell grep/find,
    // which the read-only connected-repo guard rejects — so enable them via
    // allowedTools. allowedTools is auto-allow only (it does not restrict which
    // tools are available, so it does not hide external MCP tools like Slack);
    // availability is restricted via `tools`, and access is governed by
    // canUseTool. There is no plan/workspace tool gating — view affects prompt
    // hints only.
    tools: ['default'],
    allowedTools: ['Grep', 'Glob'],
    systemPrompt,
    model,
    cwd: context.project.folder_path ?? effectiveRepoPaths[0],
    // Pin the bundled native Claude binary so the SDK skips its own PATH lookup.
    // See findClaude.ts for platform-specific resolution details.
    ...getClaudeSdkSpawnOptions(),
    canUseTool: createPermissionHandler(permissionContext, async (toolName, input, opts) => {
      return promptUser(mainWindow, permissionContext.projectId, toolName, input, {
        signal: opts.signal,
      });
    }),
    // Load user settings so claude.ai managed MCP servers (Whimsical, Glean, etc.) connect.
    // KPM's canUseTool handler takes precedence over any permission grants in settings.json.
    settingSources: ['user'],
    mcpServers: {
      kpm: kpmServer,
      // Merge in user-configured MCP servers (from ~/.claude.json)
      ...(!isFocusSession ? (enabledUserMcpConfigs ?? {}) : {}),
    },
    // Load user-enabled external MCP plugins (Slack, GitHub, etc.)
    ...(!isFocusSession && enabledPluginPaths && enabledPluginPaths.length > 0 && {
      plugins: enabledPluginPaths.map(p => ({ type: 'local' as const, path: p })),
    }),
    // Always disable the built-in option-picker tool; Claude asks clarifying
    // questions in plain text instead.
    // Disable built-in task-tracking tools (TaskCreate, TaskGet, etc.): grounded
    // chat sessions are overwhelmingly single-deliverable research or document
    // edits, and the SDK injects a recurring "use task tools" system reminder
    // whenever these are enabled. KPM's own plan tools cover multi-step tracking.
    // Disable claude.ai-oriented built-ins that conflict with KPM's local-first,
    // single-user model: Artifact publishes HTML/MD to an external Anthropic-hosted
    // URL (violates the SQLite-only / export-boundary principles and bypasses KPM's
    // own document system), Projects reads/writes a claude.ai cloud knowledge base,
    // and ShowOnboardingRolePicker drives a claude.ai onboarding UI KPM never shows.
    // Also disable any managed MCP tools the user has turned off.
    disallowedTools: [
      'AskUserQuestion',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskOutput',
      'TaskStop',
      'TaskUpdate',
      'Artifact',
      'Projects',
      'ShowOnboardingRolePicker',
      ...(disabledMcpTools ?? []),
    ],
    maxTurns: claudeConfig.maxTurns,
    promptSuggestions: !isFocusSession,
    // Stream partial assistant messages so the renderer can reveal response text
    // token-by-token. Without this the SDK only emits a complete assistant message
    // per turn step, so a paragraph lands all at once after a pause.
    includePartialMessages: claudeConfig.includePartialMessages,
    // Forward the explorer subagent's text/thinking (default only emits its
    // tool_use/tool_result). Lets us surface live "what the explorer is doing"
    // progress on its activity card without the text entering the main transcript.
    forwardSubagentText: !isFocusSession && claudeConfig.forwardSubagentText,
    // Force auto-compaction on regardless of the user's ~/.claude/settings.json
    // (loaded via settingSources). The flag-settings layer has the highest
    // priority, so long discovery sessions summarize earlier context instead of
    // hitting the context ceiling. Compaction boundaries surface in the activity feed.
    ...(claudeConfig.autoCompact && { settings: { autoCompactEnabled: true } }),
    // Periodic AI-generated progress summaries for Task-tool subagents.
    // Forks the subagent every ~30s and emits a short description on
    // `task_progress.summary`; reuses the prompt cache, so cost is minimal.
    agentProgressSummaries: !isFocusSession,
    // Read-only exploration subagent. Routes file/symbol/pattern searches
    // off the main conversation so file contents never enter the parent's
    // context — only the summary returns. Sonnet (not Haiku) because the
    // Haiku Explore subagent has a documented context-overflow failure in
    // MCP-heavy setups (anthropics/claude-code#45357); Sonnet is still ~5x
    // cheaper than Opus on cache_read.
    ...(!isFocusSession && { agents: {
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
    } }),
    // Adaptive thinking for Opus and Sonnet: Claude decides when and how much to think.
    // display: 'summarized' ensures Opus 4.8 / Sonnet 5 stream thinking content (default is 'omitted').
    ...(!isFocusSession && (model === 'opus' || model === 'sonnet') && { thinking: { type: 'adaptive' as const, display: 'summarized' as const } }),
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
