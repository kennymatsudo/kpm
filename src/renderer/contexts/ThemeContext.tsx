import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';



interface ThemeContextValue {
  /** User's theme preference (includes 'system' option) */
  resolved: ResolvedTheme;
  /** Update the theme preference */
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'kpm-theme-preference';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

  if (preference === 'system') {
  }
}

  const root = document.documentElement;
  root.classList.remove(...ALL_THEME_CLASSES);

}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(STORAGE_KEY);
  });


  useEffect(() => {

  useEffect(() => {


    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

    setPreferenceState(newPreference);
    localStorage.setItem(STORAGE_KEY, newPreference);
  }, []);

  const contextValue = useMemo(() => ({
    preference,
    resolved,
    setPreference,

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
