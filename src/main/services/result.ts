/**
 * ServiceResult - Explicit error handling for service methods.
 *
 * Use ServiceResult instead of throwing exceptions for expected errors.
 * This makes error paths explicit and forces callers to handle them.
 *
 * @example
 * ```ts
 * function getItem(id: string): ServiceResult<Item> {
 *   const item = repo.get(id);
 *   if (!item) return failure('Item not found');
 *   return success(item);
 * }
 * ```
 */
export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * AsyncResult - Promise-wrapped ServiceResult for async methods.
 *
 * @example
 * ```ts
 * async function generateArtifact(): AsyncResult<string> {
 *   return wrapAsync(async () => {
 *     const result = await claude.generate(...);
 *     return result.taskId;
 *   }, 'Failed to generate');
 * }
 * ```
 */
export type AsyncResult<T = void> = Promise<ServiceResult<T>>;

// =============================================================================
// Result Constructors
// =============================================================================

export const success = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
export const failure = (error: string): ServiceResult<never> => ({ ok: false, error });

// =============================================================================
// Result Utilities
// =============================================================================

/**
 * Unwrap a ServiceResult, throwing an error if the result is a failure.
 * Use this when the IPC handler should return data directly.
 */
export function unwrapOrThrow<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

// =============================================================================
// Async Utilities
// =============================================================================

/**
 * Wrap an async operation in a ServiceResult.
 * Catches errors and converts them to failure results.
 *
 * @example
 * ```ts
 * async function fetchData(): AsyncResult<Data> {
 *   return wrapAsync(async () => {
 *     const response = await fetch('/api/data');
 *     return response.json();
 *   }, 'Failed to fetch data');
 * }
 * ```
 */
export async function wrapAsync<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): AsyncResult<T> {
  try {
    const data = await fn();
    return success(data);
  } catch (e) {
    const msg = errorMessage ?? (e instanceof Error ? e.message : 'Unknown error');
    console.error('[ServiceResult]', msg, e);
    return failure(msg);
  }
}

