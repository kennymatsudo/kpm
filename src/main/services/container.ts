/**
 * Service Container
 *
 * Provides a single point of access to all application services.
 * Production code initializes services explicitly at app startup.
 *
 * Production usage:
 * ```ts
 * import { initializeServices } from '../services/container';
 *
 * const services = initializeServices(container);
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
import type { IRepositoryContainer } from '../db/interfaces';

// =============================================================================
// Singleton Container
// =============================================================================

let _services: AppServices | null = null;

/**
 * Initialize the application services container.
 * Production code should call this once during app startup.
 */
export function initializeServices(container: IRepositoryContainer): AppServices {
  if (!_services) {
    _services = createAppServices(container);
  }
  return _services;
}

/**
 * Get the application services container.
 * Throws if production startup has not initialized services yet.
 */
export function getServices(): AppServices {
  if (!_services) {
    throw new Error(
      'Services not initialized. Call initializeServices() at app startup or setServices() in tests.'
    );
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
