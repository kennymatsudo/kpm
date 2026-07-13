import { beforeEach, describe, expect, it } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { getOptionalSetting, getSetting, setSetting } from './settingsService';

describe('renderer typed app settings', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
  });

  it('reads and writes typed preferences without exposing storage encoding', async () => {
    api.settings.app.get.mockResolvedValue({ success: true, value: 'true' });

    expect(await getSetting('connectPromptSeen')).toBe(true);
    await setSetting('connectPromptSeen', false);

    expect(api.settings.app.set).toHaveBeenCalledWith({
      key: 'connect_prompt_seen',
      value: 'false',
    });
  });

  it('distinguishes an absent preference from its default', async () => {
    api.settings.app.get.mockResolvedValue({ success: true, value: null });

    expect(await getOptionalSetting('chatProvider')).toBeUndefined();
    expect(await getSetting('chatProvider')).toBe('claude');
  });
});
