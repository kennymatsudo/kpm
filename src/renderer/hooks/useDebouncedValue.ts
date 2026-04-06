import { useEffect, useState } from 'react';

/**
 * Returns a debounced version of the given value.
 * Updates immediately when cleared (empty string), debounces otherwise.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, isCleared?: (v: T) => boolean): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (isCleared?.(value)) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, isCleared]);

  return debounced;
}
