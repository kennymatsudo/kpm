/**
 * Service Container
 *
 * Provides a single point of access to all application services.
 * Production code initializes services explicitly at app startup.
 */

import { createAppServices, type AppServices } from './appServices';
import type { BrowserWindow } from 'electron';
import type { IRepositoryContainer } from '../db/interfaces';

let _services: AppServices | null = null;

/**
 * Initialize the application services container.
 * Production code should call this once during app startup.
 */
export function initializeServices(
  container: IRepositoryContainer,
  getMainWindow: () => BrowserWindow | null,
): AppServices {
  if (!_services) {
    _services = createAppServices(container, getMainWindow);
  }
  return _services;
}
