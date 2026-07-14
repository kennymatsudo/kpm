/**
 * App-level dependencies the generation seam needs, injected once at startup
 * (composition root) rather than threaded through every call site. This is
 * where usage recording is wired in, so the seam owns usage attribution
 * instead of each generation service.
 */

import type { GenerationProvider, GenerationPurpose, GenerationUsage } from './types';

export interface GenerationUsageEvent {
  purpose: GenerationPurpose;
  provider: GenerationProvider;
  model: string;
  projectId: string | null;
  usage: GenerationUsage;
  totalCostUsd?: number | null;
}

export interface GenerationRuntimeDeps {
  /** Records a billable generation turn. Wired to the usage service at startup. */
  recordUsage?: (event: GenerationUsageEvent) => void;
}

let deps: GenerationRuntimeDeps = {};

export function configureGeneration(next: GenerationRuntimeDeps): void {
  deps = { ...deps, ...next };
}

export function getGenerationRuntimeDeps(): GenerationRuntimeDeps {
  return deps;
}
