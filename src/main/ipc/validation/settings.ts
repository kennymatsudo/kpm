/**
 * Settings Validation Schemas
 */

import { settingsEndpoints } from '../../../shared/ipc/settingsEndpoints';

// =============================================================================
// Settings Schemas
// =============================================================================

export const SettingsSchemas = {
  saveApiKey: settingsEndpoints['anthropic.saveKey'].params,
  testApiKey: settingsEndpoints['anthropic.testKey'].params,

  /** Get app setting */
  getAppSetting: settingsEndpoints['app.get'].params,

  /** Set app setting */
  setAppSetting: settingsEndpoints['app.set'].params,
};
