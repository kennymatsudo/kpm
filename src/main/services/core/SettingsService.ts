import type { IAppSettingsRepository } from '../../db/interfaces';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';

export interface AnthropicAuthApi {
  hasApiKey(): Promise<boolean>;
  saveApiKey(apiKey: string): Promise<void>;
  deleteApiKey(): Promise<void>;
}

export interface SettingsServiceDeps {
  appSettings: IAppSettingsRepository;
  anthropicAuth: AnthropicAuthApi;
  fetchFn?: typeof fetch;
}

export function createSettingsService(deps: SettingsServiceDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async hasAnthropicKey(): AsyncResult<{ hasKey: boolean }> {
      try {
        return success({ hasKey: await deps.anthropicAuth.hasApiKey() });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async saveAnthropicKey(apiKey: string): AsyncResult<void> {
      try {
        await deps.anthropicAuth.saveApiKey(apiKey);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async deleteAnthropicKey(): AsyncResult<void> {
      try {
        await deps.anthropicAuth.deleteApiKey();
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async testAnthropicKey(apiKey: string): AsyncResult<{ valid: boolean; error?: string }> {
      try {
        const response = await fetchFn('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });

        if (response.ok) {
          return success({ valid: true });
        }

        if (response.status === 401) {
          return success({ valid: false, error: 'Invalid API key' });
        }

        if (response.status === 403) {
          return success({ valid: false, error: 'API key does not have permission' });
        }

        const errorText = await response.text();
        return success({ valid: false, error: `API error: ${response.status} - ${errorText}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return success({ valid: false, error: `Connection error: ${message}` });
      }
    },

    getAppSetting(key: string): ServiceResult<{ value: string | null }> {
      try {
        return success({ value: deps.appSettings.get(key) ?? null });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    setAppSetting(key: string, value: string): ServiceResult<void> {
      try {
        deps.appSettings.set(key, value);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getAllAppSettings(): ServiceResult<{ settings: Record<string, string> }> {
      try {
        return success({ settings: deps.appSettings.getAll() });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
