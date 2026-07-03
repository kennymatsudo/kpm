import type { z } from 'zod';
import { customThemeEndpoints } from '../../../shared/ipc/customThemeEndpoints';

export const CustomThemeSchemas = {
  importFromUrl: customThemeEndpoints.importFromUrl.params,
  delete: customThemeEndpoints.delete.params,
};

export type CustomThemeImportFromUrlInput = z.infer<typeof CustomThemeSchemas.importFromUrl>;
export type CustomThemeDeleteInput = z.infer<typeof CustomThemeSchemas.delete>;
