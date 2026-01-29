import { DropdownMenu } from '../ui';

  x: number;
  y: number;
  selectedCount: number;
  onEdit: () => void;
  onAddToContext: () => void;
  onDelete: () => void;
  onClose: () => void;
}

  return (
    <DropdownMenu
      isOpen={true}
      onClose={onClose}
      position={{ type: 'point', x, y }}
    >
      {/* Edit - only enabled when exactly 1 item selected */}
      <DropdownMenu.Item
        onClick={onEdit}
        disabled={selectedCount !== 1}
        title={selectedCount !== 1 ? 'Select a single item to edit' : undefined}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
      >
        Edit
      </DropdownMenu.Item>

      {/* Add to Chat Context */}
      <DropdownMenu.Item
        onClick={onAddToContext}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
      >
        Add to Chat Context
      </DropdownMenu.Item>

        <DropdownMenu.Item
          icon={
            <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          }
        >
        </DropdownMenu.Item>
      )}

      <DropdownMenu.Item
        variant="danger"
        onClick={onDelete}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        }
      >
        Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
