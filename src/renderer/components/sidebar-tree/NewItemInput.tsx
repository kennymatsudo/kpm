import { useState, useCallback } from 'react';

interface NewItemInputProps {
  type: 'file' | 'folder';
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * Phantom inline input row for creating a new file or folder.
 */
export function NewItemInput({ type, onSubmit, onCancel }: NewItemInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  }, [value, onSubmit, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleSubmit, onCancel]
  );

  const handleBlur = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
    } else {
      handleSubmit();
    }
  }, [value, onCancel, handleSubmit]);

  return (
    <div className="flex items-center gap-2 py-2 mx-2 rounded-lg" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
      {/* Icon */}
      {type === 'folder' ? (
        <svg
          className="w-4 h-4 flex-shrink-0 text-text-tertiary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 flex-shrink-0 text-text-tertiary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      )}

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
                   focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
        placeholder={type === 'folder' ? 'Folder name' : 'File name'}
        autoFocus
      />
    </div>
  );
}
