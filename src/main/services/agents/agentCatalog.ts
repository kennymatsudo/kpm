/**
 * Agent Catalog - Detection and configuration for available agent backends.
 *
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentType } from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

// =============================================================================
// Agent Configuration
// =============================================================================

interface AgentConfig {
  /** Binary names to search for (in order of preference) */
  binaries: string[];
  /** The opposing agent type for auto-review */
  reviewOpponent: AgentType;
}

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  claude: {
    binaries: ['claude'],
    reviewOpponent: 'codex',
  },
  codex: {
    reviewOpponent: 'claude',
  },
  gemini: {
    binaries: ['gemini'],
    reviewOpponent: 'claude',
  },
};

// =============================================================================
// Detection
// =============================================================================

/** Cached detection results (cleared on app restart) */
const availabilityCache = new Map<AgentType, { available: boolean; binaryPath: string | null }>();

/**
 * Check if a binary is available on PATH.
 */
async function whichBinary(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [name]);
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Check if a specific agent type is available on this machine.
 */
export async function isAgentAvailable(agentType: AgentType): Promise<boolean> {
  const cached = availabilityCache.get(agentType);
  if (cached) return cached.available;

  const config = AGENT_CONFIGS[agentType];
  for (const binary of config.binaries) {
    const path = await whichBinary(binary);
    if (path) {
      availabilityCache.set(agentType, { available: true, binaryPath: path });
      return true;
    }
  }

  availabilityCache.set(agentType, { available: false, binaryPath: null });
  return false;
}

/**
 * Get the binary path for an agent type.
 * Returns null if the agent is not installed.
 */
export async function getAgentBinary(agentType: AgentType): Promise<string | null> {
  // Ensure availability check has run
  await isAgentAvailable(agentType);
  return availabilityCache.get(agentType)?.binaryPath ?? null;
}

/**
 * Get all available agent types on this machine.
 */
export async function getAvailableAgents(): Promise<AgentType[]> {
  const types: AgentType[] = ['claude', 'codex', 'gemini'];
  const results = await Promise.all(types.map(async (t) => ({ type: t, available: await isAgentAvailable(t) })));
  return results.filter((r) => r.available).map((r) => r.type);
}

/**
 * Get the opposing agent type for auto-review.
 */
export function getReviewOpponent(agentType: AgentType): AgentType {
  return AGENT_CONFIGS[agentType].reviewOpponent;
}
