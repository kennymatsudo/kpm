/**
 * Service Container
 *
 * Provides a single point of access to all application services.
 *
 * ```ts
 *
 * ```
 *
 * For testing:
 * ```ts
 * import { setServices, resetServices } from '../services/container';
 *
 * beforeEach(() => {
 *   setServices({
 *     planService: createMockPlanService(),
 *   });
 * });
 *
 * afterEach(() => {
 *   resetServices();
 * });
 * ```
 */

import { createAppServices, type AppServices } from './appServices';

// =============================================================================
// Singleton Container
// =============================================================================

let _services: AppServices | null = null;

/**
 * Get the application services container.
 */
export function getServices(): AppServices {
  if (!_services) {
  }
  return _services;
}

/**
 * Reset the service container.
 * Primarily used for testing.
 */
export function resetServices(): void {
  _services = null;
}

/**
 * Set a custom service container.
 * Primarily used for testing to inject mock services.
 *
 * Accepts a partial object - any missing services will throw
 * if accessed.
 */
export function setServices(services: Partial<AppServices>): void {
  // Create a proxy that throws helpful errors for unset services
  _services = new Proxy(services as AppServices, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop as keyof AppServices];
      }
      throw new Error(
        `Service '${prop}' not provided in test. ` +
        `Add it to setServices() call or mock it.`
      );
    },
  });
}
