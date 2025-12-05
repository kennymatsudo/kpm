

interface ThemeContextValue {
  resolved: ResolvedTheme;
  /** Update the theme preference */
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'kpm-theme-preference';

  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

  if (preference === 'system') {
  }
}

  const root = document.documentElement;
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

  return (
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
