/**
 * Centralized Configuration Module
 *
 * All application configuration values in one place.
 * Use getConfig() to access values - never hardcode settings elsewhere.
 *
 * For testing, use setConfig() to inject custom configuration.
 */

import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { GenerationProvider, GenerationPurpose, GenerationTier } from '../generation/types';

type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

// =============================================================================
// Type Definitions
// =============================================================================

export interface DatabaseConfig {
  /** Database filename (relative to userData) */
  filename: string;
  /** Use WAL mode for better concurrent read/write */
  walMode: boolean;
  /** Synchronous mode: OFF (fastest), NORMAL (safe), FULL (safest) */
  synchronous: 'OFF' | 'NORMAL' | 'FULL';
  /** Enable foreign key constraints */
  foreignKeys: boolean;
}

export interface WindowConfig {
  /** Initial window width */
  width: number;
  /** Initial window height */
  height: number;
  /** Minimum window width */
  minWidth: number;
  /** Minimum window height */
  minHeight: number;
  /** Traffic light button position (macOS) */
  trafficLightPosition: { x: number; y: number };
}

export interface ClaudeConfig {
  /** Setting sources for SDK */
  settingSources: ('project' | 'user')[];
  /** Enable SDK debug output */
  debug: boolean;
  /** Path to debug log file (optional) */
  debugFile: string | null;
  /** Max agent turns per response to prevent runaway sessions */
  maxTurns: number;
  /** Default permission mode for Claude-driven automation outside plan mode */
  defaultPermissionMode: PermissionMode;
  /**
   * Stream partial assistant messages so response text renders token-by-token
   * instead of arriving as one block per turn step.
   */
  includePartialMessages: boolean;
  /**
   * Forward a subagent's text/thinking (e.g. the read-only explorer) so its
   * progress can be surfaced on the parent activity card.
   */
  forwardSubagentText: boolean;
  /**
   * Automatically summarize earlier conversation when a session approaches the
   * context limit, so long discovery sessions don't stall on overflow.
   */
  autoCompact: boolean;
}

export interface SessionConfig {
  /** Main chat idle timeout (ms) - disconnect after inactivity */
  mainIdleTimeoutMs: number;
  /** Max time for single response processing (ms) - hard cap */
  processingTimeoutMs: number;
  /** Max time with no SDK activity while processing (ms) - detects hung sessions */
  processingIdleTimeoutMs: number;
  /** Timeout waiting for user response to permission prompts (ms) */
  permissionRequestTimeoutMs: number;
  /** How often to check for stale sessions (ms) */
  cleanupIntervalMs: number;
  /** Timeout waiting for session to become ready (ms) */
  sessionReadyTimeoutMs: number;
  /** How often to poll for connecting sessions to become ready (ms) */
  sessionReadyPollIntervalMs: number;
  /** Number of consecutive MCP recovery attempts before tearing down a session */
  mcpRecoveryMaxAttempts: number;
}

export interface GenerationConfig {
  /** Claude model for quick generation tasks where speed matters most (the `fast` tier). */
  fastModel: ClaudeModel;
  /** Claude model for higher-value synthesis tasks where quality matters most (the `deep` tier). */
  deepModel: ClaudeModel;
  /** Claude model for constrained low-cost generation tasks (the `cheap` tier). */
  cheapModel: ClaudeModel;
  /** Provider that serves generation purposes unless overridden per purpose. */
  defaultProvider: GenerationProvider;
  /** Per-purpose provider override; a purpose absent here uses `defaultProvider`. */
  providerByPurpose: Partial<Record<GenerationPurpose, GenerationProvider>>;
  /** Codex tier → model id. The Claude tiers use fastModel/deepModel/cheapModel above. */
  codexModels: Record<GenerationTier, string>;
  /** Note refinement timeout (ms) */
  noteRefinementTimeoutMs: number;
  /** Artifact generation timeout (ms) */
  artifactGenerationTimeoutMs: number;
  /** Project onboarding context generation timeout (ms) */
  onboardingTimeoutMs: number;
  /** PR description generation timeout (ms) */
  prGenerationTimeoutMs: number;
}

export interface NetworkConfig {
  /** Timeout for fetching URLs (e.g., favicons) */
  fetchTimeoutMs: number;
  /** Timeout for git operations */
  gitTimeoutMs: number;
}

export interface AgentSessionConfig {
  /** Active-session threshold above which the review poller holds off auto-launching more reviews */
  maxConcurrentSessionsPerProject: number;
  /** How long to keep terminal sessions around for follow-up interactions (ms) */
  terminalSessionTtlMs: number;
  /** Timeout for the initial SDK agent session startup (ms) */
  sessionStartTimeoutMs: number;
  /** Model for Codex agent sessions (e.g. 'gpt-5.5', 'gpt-5.4'). If omitted, Codex uses its own default. */
  codexModel?: string;
}

export interface ReviewAssessmentConfig {
  /** Timeout for a single assessment pass (ms) */
  timeoutMs: number;
  /** Max turns for the review assessment agent */
  maxTurns: number;
}

export interface ReviewPollConfig {
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Whether to auto-post draft replies without human approval */
  autoPostReplies: boolean;
  /** Maximum sessions to process per poll tick */
  maxSessionsPerTick: number;
  /** Whether the poller is enabled */
  enabled: boolean;
  /** Number of ticks to skip a session after an error */
  errorBackoffTicks: number;
  /**
   * Hard floor between successful syncs of the same session (ms). Protects
   * against manual triggers and short poll intervals stacking refreshes.
   */
  minPerSessionIntervalMs: number;
  /**
   * Cap on the exponential backoff applied to a session after consecutive
   * quiet ticks (no new threads, no fix started, no needs-attention).
   * Skip = min(2^n - 1, this cap), reset on any non-quiet outcome.
   */
  maxQuietSkipTicks: number;
}

export interface WatcherConfig {
  /** Debounce delay for project file watcher (ms) */
  projectDebounceMs: number;
  /** Debounce delay for repo .git/HEAD watcher (ms) */
  repoDebounceMs: number;
  /** Debounce delay for search index doc sync watcher (ms) */
  searchDocSyncDebounceMs: number;
  /** How often the search indexer reconciles project watchers (ms) */
  searchReconcileIntervalMs: number;
  /** Delay before summarizing a file after an external edit — prevents Haiku from firing on every save during active editing (ms) */
  summarizationDebounceMs: number;
}

export interface PollSchedulerConfig {
  /** Default jitter percentage applied to scheduled polls (0–1) */
  defaultJitterPct: number;
  /** Default error backoff multiplier applied per consecutive failure */
  defaultBackoffMultiplier: number;
  /** Maximum delay between retries regardless of backoff (ms) */
  maxBackoffMs: number;
}

export interface ThemeConfig {
  /** Filename (under userData) of the window-background appearance sidecar. */
  appearanceFilename: string;
}

export interface FileExplorerConfig {
  /**
   * Extra absolute paths whose contents IPC file operations must not touch
   * even when reached via a symlink the user placed inside the project.
   * Merged with platform defaults (SSH/AWS/GPG/Keychain dirs, etc.).
   */
  deniedRealpathRoots: string[];
  /**
   * Maximum number of symlinked-directory transitions allowed while
   * recursively listing the project tree. Prevents a single in-project
   * symlink (e.g. `home -> /Users/me`) from causing the listing to
   * enumerate the entire home directory.
   */
  maxSymlinkDepth: number;
}

export interface AppConfig {
  database: DatabaseConfig;
  window: WindowConfig;
  claude: ClaudeConfig;
  session: SessionConfig;
  generation: GenerationConfig;
  network: NetworkConfig;
  agentSession: AgentSessionConfig;
  reviewAssessment: ReviewAssessmentConfig;
  reviewPoll: ReviewPollConfig;
  watcher: WatcherConfig;
  pollScheduler: PollSchedulerConfig;
  fileExplorer: FileExplorerConfig;
  theme: ThemeConfig;
}

// =============================================================================
// Default Configuration
// =============================================================================

function createDefaultConfig(): AppConfig {
  return {
    database: {
      filename: 'planner.db',
      walMode: true,
      synchronous: 'NORMAL',
      foreignKeys: true,
    },

    window: {
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      trafficLightPosition: { x: 16, y: 14 },
    },

    claude: {
      settingSources: ['project'],
      debug: false,
      debugFile: null,
      maxTurns: 200,
      defaultPermissionMode: 'bypassPermissions',
      includePartialMessages: true,
      forwardSubagentText: true,
      autoCompact: true,
    },

    session: {
      mainIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes
      processingTimeoutMs: 60 * 60 * 1000, // 60 minutes (hard cap for very long turns)
      processingIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes with no SDK activity = likely hung
      permissionRequestTimeoutMs: 60 * 60 * 1000, // 60 minutes for permission prompts
      cleanupIntervalMs: 30 * 1000, // 30 seconds
      sessionReadyTimeoutMs: 30 * 1000, // 30 seconds
      sessionReadyPollIntervalMs: 100,
      mcpRecoveryMaxAttempts: 3,
    },

    generation: {
      fastModel: 'sonnet',
      deepModel: 'sonnet',
      cheapModel: 'haiku',
      // Behavior-preserving default: every generation purpose runs on Claude.
      // Flip a purpose to Codex by adding it to providerByPurpose.
      defaultProvider: 'claude',
      providerByPurpose: {},
      codexModels: {
        fast: 'gpt-5.5',
        deep: 'gpt-5.5',
        cheap: 'gpt-5.5',
      },
      noteRefinementTimeoutMs: 2 * 60 * 1000, // 2 minutes
      artifactGenerationTimeoutMs: 5 * 60 * 1000, // 5 minutes
      onboardingTimeoutMs: 10 * 60 * 1000, // 10 minutes (multi-repo scan + agent investigation)
      prGenerationTimeoutMs: 60 * 1000, // 1 minute
    },

    network: {
      fetchTimeoutMs: 10 * 1000, // 10 seconds
      gitTimeoutMs: 5 * 1000, // 5 seconds
    },

    agentSession: {
      maxConcurrentSessionsPerProject: 3,
      terminalSessionTtlMs: 30 * 60 * 1000, // 30 minutes
      sessionStartTimeoutMs: 60 * 1000, // 1 minute
      codexModel: 'gpt-5.5',
    },

    reviewPoll: {
      pollIntervalMs: 2 * 60 * 1000, // 2 minutes
      autoPostReplies: false,
      maxSessionsPerTick: 5,
      enabled: true,
      errorBackoffTicks: 3,
      minPerSessionIntervalMs: 90 * 1000, // 90s floor
      maxQuietSkipTicks: 7, // ~14 min at 2-min base
    },

    reviewAssessment: {
      timeoutMs: 8 * 60 * 1000, // 8 minutes
      maxTurns: 40,
    },

    watcher: {
      projectDebounceMs: 100,
      repoDebounceMs: 100,
      searchDocSyncDebounceMs: 400,
      searchReconcileIntervalMs: 30 * 1000,
      summarizationDebounceMs: 30 * 1000,
    },

    pollScheduler: {
      defaultJitterPct: 0.1,
      defaultBackoffMultiplier: 2,
      maxBackoffMs: 30 * 60 * 1000, // 30 minutes
    },

    fileExplorer: {
      deniedRealpathRoots: [],
      maxSymlinkDepth: 1,
    },

    theme: {
      appearanceFilename: 'theme-appearance.json',
    },
  };
}

// =============================================================================
// Config Singleton
// =============================================================================

let _config: AppConfig | null = null;

/**
 * Get the application configuration.
 * Creates default config on first access.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    _config = createDefaultConfig();
  }
  return _config;
}

/**
 * Set a custom configuration.
 * Primarily used for testing to inject mock configuration.
 */
export function setConfig(config: AppConfig): void {
  _config = config;
}

/**
 * Create a partial config override merged with defaults.
 * Useful for tests that only need to change specific values.
 */
export function createTestConfig(overrides: DeepPartial<AppConfig>): AppConfig {
  const defaults = createDefaultConfig();
  return deepMerge(defaults, overrides);
}

// =============================================================================
// Utility Types and Functions
// =============================================================================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as object,
        sourceValue as DeepPartial<typeof targetValue>
      );
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}
