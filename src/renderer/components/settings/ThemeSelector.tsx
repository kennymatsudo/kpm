
export function ThemeSelector() {

  return (
        >

              )}
            </div>

            </div>
    </div>
  );
}

interface ThemePreviewProps {
}

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
