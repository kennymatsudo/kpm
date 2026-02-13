/**
 * Shell Validation Schemas
 */

import { z } from 'zod';
import { isAllowedExternalUrl } from '../../security/externalUrl';

// =============================================================================
// Shell Schemas
// =============================================================================

export const ShellSchemas = {
  /** Open URL in default browser */
  openExternal: z.object({
    url: z
      .string()
      .url('Valid URL is required')
      .refine(
        isAllowedExternalUrl,
        'Only http, https, and mailto URLs are allowed'
      ),
  }),
};
