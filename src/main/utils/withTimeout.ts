export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  fallbackOnTimeout: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackOnTimeout), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
