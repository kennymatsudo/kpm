/**
 * Settings Validation Schemas
 */

import { z } from 'zod';
import { anthropicApiKey } from './shared';

// =============================================================================
// Settings Schemas
// =============================================================================

export const SettingsSchemas = {
  saveApiKey: z.object({
    apiKey: anthropicApiKey,
  }),

  testApiKey: z.object({
    apiKey: anthropicApiKey,
  }),

  /** Get app setting */
  getAppSetting: z.object({
    key: z.string().min(1),
  }),

  /** Set app setting */
  setAppSetting: z.object({
    key: z.string().min(1),
    value: z.string(),
  }),
};
