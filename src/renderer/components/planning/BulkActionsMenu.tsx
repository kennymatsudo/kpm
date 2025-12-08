
  x: number;
  y: number;
  selectedCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

    >
      {/* Edit - only enabled when exactly 1 item selected */}
        disabled={selectedCount !== 1}
        title={selectedCount !== 1 ? 'Select a single item to edit' : undefined}
      >
        Edit
        >
      )}
      >
        Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}
  );
}
