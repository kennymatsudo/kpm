
/**
 * Hook for persisting a Set to localStorage with automatic sync.
 * Handles JSON parsing errors gracefully by returning empty set.
 *
 * @param key - localStorage key (can be null to disable persistence)
 * @returns [set, setSet] tuple similar to useState
 */
export function useLocalStorageSet<T>(key: string | null): [Set<T>, (value: Set<T>) => void] {
  const [value, setValue] = useState<Set<T>>(() => {
    if (!key) return new Set();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as T[]);
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

    if (!key) {
      setValue(new Set());
      return;
    }
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setValue(new Set(JSON.parse(saved) as T[]));
      } catch {
        setValue(new Set());
      }
    } else {
      setValue(new Set());
    }
  }, [key]);

  useEffect(() => {
    }
  }, [key, value]);

  const setValueCallback = useCallback((newValue: Set<T>) => {
    setValue(newValue);
  }, []);

  return [value, setValueCallback];
}
