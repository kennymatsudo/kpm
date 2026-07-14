/**
 * Provider-neutral contract for one-shot AI generation.
 *
 * `runGeneration` is the single seam every genuinely one-shot generation site
 * calls: prompt in, text out. It resolves a (purpose, tier) to a concrete
 * provider + model, applies the pinned generation invariants, records usage,
 * and dispatches to a provider adapter.
 *
 * Deliberately small. Tool-using / multi-turn work (custom prompt, onboarding,
 * PR review assessment, scheduled loops, the Slack tool-reading adapter) is
 * agentic, not one-shot generation, and belongs on the chat/agent provider
 * path — not here. Keeping those out is what lets this interface stay a plain
 * prompt→text call with no toolset, structured-output, or reasoning knobs.
 */

/** Backends that can serve a generation call. */
export type GenerationProvider = 'claude' | 'codex';

/** Quality/cost tier; resolved to a concrete provider model inside the seam. */
export type GenerationTier = 'fast' | 'deep' | 'cheap';

/** Names the calling site. Keys provider routing and usage attribution. */
export type GenerationPurpose =
  | 'briefing'
  | 'pr_description'
  | 'commit_message'
  | 'slack_triage'
  | 'file_summary';

/** Coarse neutral terminal outcome. Providers map their native reasons in. */
export type GenerationOutcomeStatus = 'completed' | 'max_turns' | 'error';

export interface GenerationOutcome {
  status: GenerationOutcomeStatus;
  /** Provider-native detail for `error`; absent on `completed`. */
  detail?: string;
  /** Raw provider reason code, preserved for diagnostics. */
  reasonCode?: string;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
}

export interface GenerationRequest {
  purpose: GenerationPurpose;
  tier: GenerationTier;
  /** The user turn. */
  prompt: string;
  /** Optional system prompt. Codex has no system-prompt field; its adapter
   *  prepends this to the prompt. */
  systemPrompt?: string;
  /** Turn cap. One-shot text sites use 1; omit to use the provider default. */
  maxTurns?: number;
  /** Hard timeout; the seam aborts the run when it fires. Omit/0 to wait. */
  timeoutMs?: number;
  timeoutMessage?: string;
  /** Usage attribution; nullable for project-less calls. */
  projectId?: string | null;
  /** Assistant text as it streams; receives deltas, not the running total. */
  onText?: (delta: string) => void;
}

export interface GenerationResult {
  provider: GenerationProvider;
  model: string;
  /** Concatenated assistant text. */
  text: string;
  outcome: GenerationOutcome;
  usage?: GenerationUsage;
  totalCostUsd?: number;
  /** Provider errors; empty on a clean run. */
  errors: string[];
}

/** A request paired with the concrete model routing chose for it. */
export interface ResolvedGenerationRequest extends GenerationRequest {
  provider: GenerationProvider;
  model: string;
}

export interface GenerationRunHooks {
  /** Fired per billable turn so the seam records usage. */
  onUsage?: (usage: GenerationUsage, totalCostUsd?: number | null) => void;
}

/** One per provider. The seam picks an adapter via routing, then calls `run`. */
export interface GenerationProviderAdapter {
  readonly provider: GenerationProvider;
  run(
    request: ResolvedGenerationRequest,
    hooks?: GenerationRunHooks,
  ): Promise<GenerationResult>;
}
