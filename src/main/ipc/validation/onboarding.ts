/**
 * Onboarding Wizard Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

export const OnboardingSchemas = {
  saveContextDirectories: z.object({
    projectId: uuid,
    repoDirectories: z.record(z.string(), z.array(z.string())).default({}),
  }),

  generate: z.object({
    taskId: z.string().min(1),
    projectId: uuid,
    description: z.string().max(10000).default(''),
    repoDirectories: z.record(z.string(), z.array(z.string())).default({}),
  }),

  saveContext: z.object({
    projectId: uuid,
    content: z.string().min(1, 'Content cannot be empty'),
  }),
};

// Inferred types
export type OnboardingGenerateInput = z.infer<typeof OnboardingSchemas.generate>;
export type OnboardingSaveContextInput = z.infer<typeof OnboardingSchemas.saveContext>;
export type OnboardingSaveContextDirectoriesInput = z.infer<typeof OnboardingSchemas.saveContextDirectories>;
