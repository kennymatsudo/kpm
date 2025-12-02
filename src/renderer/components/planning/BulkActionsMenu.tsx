
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
      >
        Edit
      >
        Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}
  );
}
