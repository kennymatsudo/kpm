/**
 * SDK Options builder for Claude sessions.
 *
 * Builds the Options object needed for the Claude SDK query() function.
 * This is used by both the per-query and streaming session patterns.
 */

import type { Options as SDKOptions, OnElicitation } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserWindow } from 'electron';
import { buildFocusSystemPrompt, buildSystemPrompt, type PlanContext } from '../chat/prompts/index';
import { createKpmToolHook, createPermissionPrompt, type PermissionContext, type ContextFileInterceptFn, type ProjectFileInterceptFn } from './permissions';
import { getFocusKpmServer, getGrantedKpmServer, getKpmServer } from '../kpmTools/createKpmServer';
import type { KpmToolCapability } from '../kpmTools/runtime';
import { getConfig } from '../config';
import { getClaudeSdkSpawnOptions } from './findClaude';
import { promptUser } from '../services/core/PermissionPromptService';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';
import { getAgentEnv } from '../services/streaming/envUtils';

export type ModelType = 'opus' | 'sonnet' | 'haiku';

export interface BuildSdkOptionsParams {
  context: PlanContext;
  model: ModelType;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  resumeSessionId?: string;
  mainWindow: BrowserWindow | null;
  /**
   * The chat to ask in when the user's permission settings ask. Omitted by
   * non-chat callers, whose asks are denied.
   */
  chatSessionId?: string;
  /** Callback for intercepted project context file edits */
  onContextFileEdit?: ContextFileInterceptFn;
  /** Callback for intercepted project file writes */
  onProjectFileWrite?: ProjectFileInterceptFn;
  /** Returns pending content for a project-relative path so same-file edits accumulate */
  peekPendingFile?: (relativeFilePath: string) => string | undefined;
  /** External plugin paths to load (for non-managed MCP servers) */
  enabledPluginPaths?: string[];
  /** Tool names to disallow (for disabled managed MCP servers) */
  disabledMcpTools?: string[];
  /** Server names the PreToolUse hook denies (for disabled managed MCP servers) */
  disabledMcpServerNames?: string[];
  /** Callback for MCP elicitation requests (auth flows, form input) */
  onElicitation?: OnElicitation;
  /**
   * Narrows the KPM tool set to the capabilities this run was granted. Action
   * runs pass their grant; chat and focus sessions omit it and get the full set.
   */
  grantedCapabilities?: readonly KpmToolCapability[];
  /** Load the Claude in Chrome browser tools. Ignored in focus sessions. */
  claudeInChrome?: boolean;
}

/**
 * Build SDK options for a Claude session.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SDKOptions {
  const { context, model, effort, resumeSessionId, mainWindow, chatSessionId, onContextFileEdit, onProjectFileWrite, peekPendingFile, enabledPluginPaths, disabledMcpTools, disabledMcpServerNames, onElicitation, grantedCapabilities, claudeInChrome } = params;
  // Resume restores conversation history only — the SDK applies whatever
  // systemPrompt we pass now and discards the one persisted in the transcript.
  // So always send the full prompt; slimming it on resume silently drops
  // RESPONSE_STYLE, constraints, grounding, the tool tree, and plan rules on
  // every post-idle turn. Prompt caching absorbs the cost (a 30-min idle has
  // already expired the cache TTL).
  //
  // That behaviour is exactly what `snapshot: false` preserves. Since SDK
  // 0.3.267 a bare-string systemPrompt defaults to `snapshot: true`, which
  // records the prompt from the conversation's first request and replays it
  // verbatim on every later request and resume — so plan edits, a view switch,
  // and any other context this prompt carries would stop
  // reaching the model until the session compacted.
  const isFocusSession = !!context.focusDocument;
  const systemPromptText = isFocusSession ? buildFocusSystemPrompt(context) : buildSystemPrompt(context);
  const systemPrompt = { type: 'custom' as const, prompt: systemPromptText, snapshot: false };
  const effectiveRepoPaths = context.repos.map(resolveEffectiveRepoPath);

  const permissionContext: PermissionContext = {
    projectPath: context.project.folder_path,
    projectId: context.project.id,
    chatSessionId,
    onContextFileEdit,
    onProjectFileWrite,
    peekPendingFile,
    disabledMcpServerNames,
  };

  // Get MCP server
  const kpmServer = isFocusSession
    ? getFocusKpmServer()
    : grantedCapabilities
      ? getGrantedKpmServer(grantedCapabilities)
      : getKpmServer();

  // Build options
  const claudeConfig = getConfig().claude;
  const bundledClaudeSpawnOptions = getClaudeSdkSpawnOptions();
  const sdkOptions: SDKOptions = {
    // `tools: ['default']` selects the native binary's full built-in preset.
    // 'default' only expands to the preset when it is the sole value: adding
    // names (e.g. ['default','Grep','Glob']) turns the array into an explicit
    // allowlist where 'default' is an unknown no-op, collapsing the built-in set
    // to just the listed names and silently dropping Bash/WebSearch/Read/Edit/etc.
    // Availability is restricted via `tools`; what may run is the user's own
    // Claude Code permission settings, loaded through settingSources.
    tools: ['default'],
    systemPrompt,
    model,
    cwd: context.project.folder_path ?? effectiveRepoPaths[0],
    // Pin the bundled native Claude binary so the SDK skips its own PATH lookup.
    // See findClaude.ts for platform-specific resolution details.
    ...bundledClaudeSpawnOptions,
    canUseTool: createPermissionPrompt(permissionContext, async (toolName, input, opts) => {
      return promptUser(mainWindow, permissionContext.projectId, toolName, input, {
        signal: opts.signal,
        chatSessionId: permissionContext.chatSessionId,
        kind: opts.kind,
        title: opts.title,
      });
    }),
    hooks: {
      PreToolUse: [createKpmToolHook(permissionContext)],
    },
    // Load user settings so claude.ai managed MCP servers (Whimsical, Glean, etc.)
    // connect, and so the user's permission rules and sandbox apply.
    settingSources: ['user'],
    // Only KPM's own server. settingSources already loads ~/.claude.json
    // servers; passing them here too makes the CLI hold `init` until every
    // claude.ai connector connects, which can outrun the session start timeout.
    mcpServers: {
      kpm: kpmServer,
    },
    // Load user-enabled external MCP plugins (Slack, GitHub, etc.)
    ...(!isFocusSession && enabledPluginPaths && enabledPluginPaths.length > 0 && {
      plugins: enabledPluginPaths.map(p => ({ type: 'local' as const, path: p })),
      // Send the plugin list over stdin instead of one --plugin-dir flag each,
      // so a user with many plugins enabled cannot push the command line past
      // the 32,767-character limit Windows refuses to start a process above.
      // Only safe on the binary we ship: a `claude` picked up from PATH may
      // predate 2.1.261 and would exit on the unknown --await-initialize.
      ...(bundledClaudeSpawnOptions && { pluginDelivery: 'initialize' as const }),
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
    // and ShareOnboardingGuide uploads a guide to an org-shared cloud link. Both
    // onboarding names are listed: the binary renamed the tool, and disallowing a
    // name it no longer ships is a harmless no-op, so keep the old one until a
    // probe confirms no supported binary still uses it.
    // ProposeGoal sets a session completion condition through an approval dialog
    // KPM has no renderer for, and its only escape hatch is the CLI's /goal command.
    // Also disable any managed MCP tools the user has turned off.
    disallowedTools: [
      'AskUserQuestion',
      'ProposeGoal',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskOutput',
      'TaskStop',
      'TaskUpdate',
      'Artifact',
      'Projects',
      'ShowOnboardingRolePicker',
      'ShareOnboardingGuide',
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
          'Use for broad searches that span several connected repos at once — ' +
          'locating where a symbol, pattern, or convention lives across repo ' +
          'boundaries. The subagent works in an isolated context and returns a ' +
          'concise summary, so large file content never enters this conversation. ' +
          'Do NOT use it for searches within a single repo, reading project files ' +
          'or documents, code review, multi-file design reasoning, or anything ' +
          'needing the main conversation\'s context — use Grep/Glob/Read directly.',
        prompt:
          'You are a fast, read-only research agent. Locate or read what is ' +
          'requested, then return a concise summary with file:line citations or ' +
          'section anchors. Do not include large file excerpts — synthesize and ' +
          'quote selectively. Do not propose changes. If you cannot find or access ' +
          'what was asked, say so explicitly rather than guessing.',
        tools: ['Read', 'Grep', 'Glob', 'WebFetch'],
        model: 'sonnet',
        maxTurns: claudeConfig.maxTurns,
      },
    } }),
    // Adaptive thinking for Opus and Sonnet: Claude decides when and how much to think.
    // display: 'summarized' streams thinking content; the model default is 'omitted'.
    ...((model === 'opus' || model === 'sonnet') && { thinking: { type: 'adaptive' as const, display: 'summarized' as const } }),
    // Effort level: guides how much thinking Claude applies (works with adaptive thinking)
    ...(effort && { effort }),
    // Fallback to Sonnet if the primary model is unavailable (e.g., rate limited)
    ...(model === 'opus' && { fallbackModel: 'sonnet' }),
    ...(resumeSessionId && { resume: resumeSessionId }),
    ...(claudeConfig.debug && { debug: true }),
    ...(claudeConfig.debug && claudeConfig.debugFile && { debugFile: claudeConfig.debugFile }),
    // Handle MCP elicitation requests (auth flows, form inputs from managed servers)
    ...(onElicitation && { onElicitation }),
    ...(claudeInChrome && !isFocusSession && { extraArgs: { chrome: null } }),
    env: { ...getAgentEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
  };

  // Add connected repos as accessible directories
  if (context.repos.length > 0) {
    sdkOptions.additionalDirectories = effectiveRepoPaths;
  }

  return sdkOptions;
}
