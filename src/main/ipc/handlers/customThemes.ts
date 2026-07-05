import type { CustomThemeService } from '../../services/core/CustomThemeService';
import { createRegistryIpcHandlers } from '../validation/utils';
import { customThemeEndpoints, type CustomThemeEndpointName } from '../../../shared/ipc/customThemeEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';

/**
 * One handler per `customThemeEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type CustomThemeHandlers = {
  [K in CustomThemeEndpointName]: UnwrappedHandlerFor<typeof customThemeEndpoints, K>;
};

function buildCustomThemeHandlers(customThemeService: CustomThemeService): CustomThemeHandlers {
  return {
    list: () => {
      const result = customThemeService.list();
      if (!result.ok) throw new Error(result.error);
      return { themes: result.data };
    },

    importFromUrl: async ({ url }) => {
      const result = await customThemeService.importFromVsCodeThemesUrl(url);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    delete: ({ themeId }) => {
      const result = customThemeService.delete(themeId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

export function registerCustomThemeHandlers(customThemeService: CustomThemeService): void {
  createRegistryIpcHandlers(
    customThemeEndpoints,
    buildCustomThemeHandlers(customThemeService),
    'Custom theme operation failed'
  );
}
