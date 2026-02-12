/**
 * Centralized Configuration Module
 *
 * All application configuration values in one place.
 * Use getConfig() to access values - never hardcode settings elsewhere.
 *
 * For testing, use setConfig() to inject custom configuration.
 */

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
}

export interface SessionConfig {
  /** Main chat idle timeout (ms) - disconnect after inactivity */
  mainIdleTimeoutMs: number;
  /** Max time for single response processing (ms) - hard cap */
  processingTimeoutMs: number;
  /** Max time with no SDK activity while processing (ms) - detects hung sessions */
  processingIdleTimeoutMs: number;
  /** How often to check for stale sessions (ms) */
  cleanupIntervalMs: number;
  /** Timeout waiting for session to become ready (ms) */
  sessionReadyTimeoutMs: number;
}

export interface GenerationConfig {
  /** Note refinement timeout (ms) */
  noteRefinementTimeoutMs: number;
  /** Artifact generation timeout (ms) */
  artifactGenerationTimeoutMs: number;
}

export interface NetworkConfig {
  /** Timeout for fetching URLs (e.g., favicons) */
  fetchTimeoutMs: number;
  /** Timeout for git operations */
  gitTimeoutMs: number;
}

export interface AppConfig {
  database: DatabaseConfig;
  window: WindowConfig;
  claude: ClaudeConfig;
  session: SessionConfig;
  generation: GenerationConfig;
  network: NetworkConfig;
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
    },

    claude: {
      settingSources: ['project'],
      debug: false,
      debugFile: null,
    },

    session: {
      mainIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: 30 * 1000, // 30 seconds
      sessionReadyTimeoutMs: 30 * 1000, // 30 seconds
    },

    generation: {
      noteRefinementTimeoutMs: 2 * 60 * 1000, // 2 minutes
      artifactGenerationTimeoutMs: 5 * 60 * 1000, // 5 minutes
    },

    network: {
      fetchTimeoutMs: 10 * 1000, // 10 seconds
      gitTimeoutMs: 5 * 1000, // 5 seconds
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
