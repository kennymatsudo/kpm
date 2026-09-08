import { lazy, type ComponentType } from 'react';

const RETRY_DELAY_MS = 200;

/**
 * `React.lazy` that retries the import once before it gives up.
 *
 * A lazy chunk can fail to load for reasons that have nothing to do with the
 * component: in dev, Vite re-bundles dependencies the moment it discovers one
 * that wasn't in the initial scan, and every module request in flight during
 * that rebuild fails with "Failed to fetch dynamically imported module". Left
 * unhandled it throws to the nearest error boundary, so one unlucky chunk
 * request replaces the whole chat panel with a crash screen. The retry lands
 * after the new module graph is being served.
 *
 * `optimizeDeps.include` in `electron.vite.config.ts` keeps the known lazy-only
 * dependencies out of that situation; this is the backstop for the rest.
 */
// The `any` mirrors React.lazy's own constraint; narrowing it to `unknown` or
// `never` breaks props inference at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await load();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return load();
    }
  });
}
