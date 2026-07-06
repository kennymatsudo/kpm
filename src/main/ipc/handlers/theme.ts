import { createRegistryIpcHandlers } from '../validation/utils';
import { themeEndpoints, type ThemeEndpointName } from '../../../shared/ipc/themeEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { writeThemeAppearance } from '../../bootstrap/themeAppearance';

/**
 * One handler per `themeEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type ThemeHandlers = {
  [K in ThemeEndpointName]: UnwrappedHandlerFor<typeof themeEndpoints, K>;
};

function buildThemeHandlers(): ThemeHandlers {
  return {
    reportResolved: ({ surface0, colorScheme }) => {
      writeThemeAppearance({ surface0, colorScheme });
    },
  };
}

export function registerThemeHandlers(): void {
  createRegistryIpcHandlers(themeEndpoints, buildThemeHandlers(), 'Theme operation failed');
}
