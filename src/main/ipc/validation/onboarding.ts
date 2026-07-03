/**
 * Onboarding Wizard Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/onboardingEndpoints.ts` (one
 * entry per IPC endpoint, shared with the preload bridge and the handler
 * binding).
 */

import type { z } from 'zod';
import { onboardingEndpoints } from '../../../shared/ipc/onboardingEndpoints';

export const OnboardingSchemas = {
  generate: onboardingEndpoints.generate.params,
  saveContext: onboardingEndpoints.saveContext.params,
  saveContextDirectories: onboardingEndpoints.saveContextDirectories.params,
};

// Inferred types
export type OnboardingGenerateInput = z.infer<typeof OnboardingSchemas.generate>;
export type OnboardingSaveContextInput = z.infer<typeof OnboardingSchemas.saveContext>;
export type OnboardingSaveContextDirectoriesInput = z.infer<typeof OnboardingSchemas.saveContextDirectories>;
