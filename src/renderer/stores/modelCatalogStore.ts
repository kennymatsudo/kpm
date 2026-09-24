import { useCallback } from 'react';
import { create } from 'zustand';
import {
  FALLBACK_MODEL_CATALOG,
  formatModelName,
  formatRecordedModelName,
  type ModelCatalog,
} from '../../shared/modelCatalog';
import { getModelCatalog, onModelCatalogChange } from '../services/chatService';

interface ModelCatalogState {
  catalog: ModelCatalog;
}

/**
 * The main process's model list, mirrored for display. Loaded once at
 * startup and replaced whenever the launch-time refresh finds a change.
 */
export const useModelCatalogStore = create<ModelCatalogState>(() => ({
  catalog: FALLBACK_MODEL_CATALOG,
}));

// Load once at startup; the push event covers every later change. Guarded for Node.js test environments.
if (typeof window !== 'undefined') {
  void getModelCatalog().then((result) => {
    if (result.success) useModelCatalogStore.setState({ catalog: result.catalog });
  });
  onModelCatalogChange((catalog) => useModelCatalogStore.setState({ catalog }));
}

/** The display name for a model id as it would run today, re-rendering when the model list changes. */
export function useModelName(): (model: string) => string {
  const catalog = useModelCatalogStore((state) => state.catalog);
  return useCallback((model: string) => formatModelName(model, catalog), [catalog]);
}

/** The display name for a model id saved with past activity. See `formatRecordedModelName`. */
export function useRecordedModelName(): (model: string) => string {
  const catalog = useModelCatalogStore((state) => state.catalog);
  return useCallback((model: string) => formatRecordedModelName(model, catalog), [catalog]);
}
