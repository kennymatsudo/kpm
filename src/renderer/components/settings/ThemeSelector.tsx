import { useState } from 'react';
import { isCustomThemeOption, type ThemeOption } from '../../themes';
import { LoadingButton } from '../ui/LoadingButton';
import { toast } from '../../stores/toastStore';

/** Visual theme selector with custom theme import. */
export function ThemeSelector() {
  const {
    preference,
    setPreference,
    themes,
    isLoadingCustomThemes,
    importThemeFromUrl,
    deleteTheme,
  } = useTheme();
  const [themeUrl, setThemeUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null);

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = themeUrl.trim();
    if (!url || isImporting) return;

    setIsImporting(true);
    const result = await importThemeFromUrl(url);
    setIsImporting(false);

    if (result.success && result.theme) {
      setThemeUrl('');
      toast.success(`Imported ${result.theme.name}`);
      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }
    } else {
      toast.error(result.error ?? 'Failed to import theme');
    }
  };

  const handleDelete = async (event: React.MouseEvent, theme: ThemeOption) => {
    event.stopPropagation();
    if (!isCustomThemeOption(theme) || deletingThemeId) return;

    setDeletingThemeId(theme.customThemeId);
    const result = await deleteTheme(theme.customThemeId);
    setDeletingThemeId(null);

    if (result.success) {
      toast.success(`Deleted ${theme.name}`);
    } else {
      toast.error(result.error ?? 'Failed to delete theme');
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => void handleImport(event)} className="flex gap-2">
        <input
          value={themeUrl}
          onChange={(event) => setThemeUrl(event.target.value)}
          className="input flex-1 px-3 py-2 text-sm"
          placeholder="https://vscodethemes.com/e/publisher.extension/theme"
          aria-label="VS Code Themes URL"
        />
        <LoadingButton
          type="submit"
          size="sm"
          isLoading={isImporting}
          loadingText="Importing"
          disabled={!themeUrl.trim()}
        >
          Import
        </LoadingButton>
      </form>

      <div className="grid grid-cols-2 gap-3">
        {themes.map((theme) => (
          <div
            key={theme.id}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
              }
            }}
            role="button"
            tabIndex={0}
            className={`
              focus:outline-none focus:ring-2 focus:ring-accent/40
              relative flex min-h-[106px] flex-col rounded-xl p-3 transition-all text-left
              border-2
              ${preference === theme.id
                ? 'border-accent bg-accent/5 shadow-md'
                : 'border-transparent bg-surface-2 hover:bg-surface-3 hover:border-border-default'
              }
            `}
            aria-pressed={preference === theme.id}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <ThemePreview theme={theme} />
              {isCustomThemeOption(theme) && (
                <button
                  type="button"
                  onClick={(event) => void handleDelete(event, theme)}
                  disabled={deletingThemeId === theme.customThemeId}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger-muted disabled:opacity-50"
                  aria-label={`Delete ${theme.name}`}
                  title="Delete theme"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a49.04 49.04 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{theme.name}</span>
                {preference === theme.id && (
                  <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="line-clamp-2 text-xs text-text-muted">{theme.description}</span>
            </div>

            {theme.id === 'system' && (
              <div className="absolute top-3 right-3">
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {isLoadingCustomThemes && (
        <div className="text-xs text-text-muted">Loading themes...</div>
      )}
    </div>
  );
}

interface ThemePreviewProps {
  theme: ThemeOption;
}

/** Preview swatches showing theme colors. */
function ThemePreview({ theme }: ThemePreviewProps) {
  const { preview } = theme;

  return (
    <div
      className="flex items-center gap-1.5 p-1.5 rounded-lg"
      style={{ backgroundColor: preview.surface }}
    >
      <div
        className="w-6 h-6 rounded-md border border-border-subtle"
        style={{ backgroundColor: preview.surface }}
        title="Surface"
      />
      <div
        className="w-6 h-6 rounded-md"
        style={{ backgroundColor: preview.accent }}
        title="Accent"
      />
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold"
        style={{ backgroundColor: preview.surface, color: preview.text }}
        title="Text"
      >
        Aa
      </div>
    </div>
  );
}
