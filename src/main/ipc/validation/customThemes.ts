import { z } from 'zod';

export const CustomThemeSchemas = {
  importFromUrl: z.object({
    url: z.string().trim().min(1).max(500),
  }),

  delete: z.object({
    themeId: z.string().trim().min(1).max(200),
  }),
};

export type CustomThemeImportFromUrlInput = z.infer<typeof CustomThemeSchemas.importFromUrl>;
export type CustomThemeDeleteInput = z.infer<typeof CustomThemeSchemas.delete>;

