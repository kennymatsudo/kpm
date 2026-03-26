import { useState, useRef, useCallback, useEffect } from 'react';
import { CloseIcon } from '../icons';

interface DirectoryAutocompleteProps {
  repoPath: string;
  repoName: string;
  directories: string[];
  onDirectoriesChange: (dirs: string[]) => void;
}

export function DirectoryAutocomplete({
  repoPath,
  repoName,
  directories,
  onDirectoriesChange,
}: DirectoryAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (prefix: string) => {
    if (!prefix) {
      setSuggestions([]);
      return;
    }
    try {
      const filtered = results.filter((d: string) => !directories.includes(d));
      setSuggestions(filtered);
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [repoPath, directories]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, 250);
  }, [fetchSuggestions]);

  const addDirectory = useCallback((dir: string) => {
    if (!directories.includes(dir)) {
      onDirectoriesChange([...directories, dir]);
    }
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [directories, onDirectoriesChange]);

  const removeDirectory = useCallback((dir: string) => {
    onDirectoriesChange(directories.filter(d => d !== dir));
  }, [directories, onDirectoriesChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        addDirectory(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        // Allow adding custom paths
        const dir = inputValue.trim().endsWith('/') ? inputValue.trim() : inputValue.trim() + '/';
        addDirectory(dir);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [selectedIndex, suggestions, inputValue, addDirectory]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-text-secondary font-mono">
        {repoName}/
      </div>

      {/* Existing directories */}
      {directories.map(dir => (
        <div
          key={dir}
          className="flex items-center gap-2 px-2.5 py-1.5 bg-accent-subtle/60 rounded-md"
        >
          <span className="flex-1 text-xs text-text-primary font-mono truncate" title={dir}>
            {dir}
          </span>
          <button
            type="button"
            onClick={() => removeDirectory(dir)}
            className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-surface-3 transition-colors"
            aria-label={`Remove ${dir}`}
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Input with autocomplete */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
          }}
          placeholder="Type a directory path..."
          className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-2 border border-border-default rounded-md text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />

          <div
            ref={suggestionsRef}
          >
            {suggestions.map((suggestion, i) => (
              <button
                key={suggestion}
                type="button"
                className={`w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-surface-3 transition-colors ${
                  i === selectedIndex ? 'bg-surface-3 text-text-primary' : 'text-text-secondary'
                }`}
                onMouseDown={e => {
                  e.preventDefault();
                  addDirectory(suggestion);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {suggestion}
              </button>
            ))}
        )}
      </div>
    </div>
  );
}
