import { useState, useCallback } from 'react';
import { FileTextIcon, FolderIcon } from '../icons';

interface NewItemInputProps {
  type: 'file' | 'folder';
  /** Indent to match the depth of the folder the item is being created in. */
  indentPx?: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * Inline row for naming a new file or folder. Occupies the same 32px box as a
 * tree row so the field lands exactly where the item will appear.
 */
export function NewItemInput({ type, indentPx = 0, onSubmit, onCancel }: NewItemInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  }, [value, onSubmit, onCancel]);

  // The tree binds arrow keys and Enter for navigation, so keystrokes meant for
  // this field must not reach it.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleSubmit, onCancel]
  );

  return (
    <div className="h-8 px-2">
      <div className="flex h-full items-center gap-2 px-3 rounded-sm">
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ paddingLeft: `${indentPx}px` }}
        >
          <div className="w-4 h-4 flex-shrink-0" />
          {type === 'folder' ? (
            <FolderIcon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
          ) : (
            <FileTextIcon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
          )}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-surface-2 border border-border-default rounded-sm px-2 py-0.5
                       text-sm text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent focus:ring-2 focus:ring-focus-ring
                       transition-colors"
            placeholder={type === 'folder' ? 'Folder name' : 'File name'}
            aria-label={type === 'folder' ? 'New folder name' : 'New file name'}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
