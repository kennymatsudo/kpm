export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export const success = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
export const failure = (error: string): ServiceResult<never> => ({ ok: false, error });

export function unwrapOrThrow<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}
