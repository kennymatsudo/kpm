import type { EndpointPayload } from '../../shared/ipc/endpoints';
import type { themeEndpoints } from '../../shared/ipc/themeEndpoints';

export function reportResolvedThemeAppearance(
  appearance: EndpointPayload<(typeof themeEndpoints)['reportResolved']>,
) {
  return window.api.theme.reportResolved(appearance);
}
