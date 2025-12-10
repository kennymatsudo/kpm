
interface Props {
  projectId: string;
  associationId: string;
  onClose: () => void;
  onExportComplete: () => void;
}

export function SyncReviewModal({ projectId, associationId, onClose, onExportComplete }: Props) {
  const {
    phase,
    items,
    exportResult,
    error,
    startReview,
    setDecision,
    executeApproved,
    removeFromReview,
    reset,
  } = useSyncReviewStore();


  // Start review on mount
  useEffect(() => {
    void startReview(projectId, associationId);
    return () => reset();
  }, [projectId, associationId, startReview, reset]);

  const checkedItems = useMemo(
    () => items.filter(i => i.decision === 'approved'),
    [items]
  );

  const validItems = useMemo(
    () => items.filter(i => i.validationErrors.length === 0),
    [items]
  );

  const allValidChecked = validItems.length > 0 && validItems.every(i => i.decision === 'approved');

  // Handlers
  const handleToggleItem = (itemId: string) => {
    const item = items.find(i => i.planItem.id === itemId);
    if (!item || item.validationErrors.length > 0) return;
  };

  const handleToggleAll = () => {
    const newDecision = allValidChecked ? 'pending' : 'approved';
  };

  const handleRemove = async (itemId: string) => {
    await removeFromReview(itemId);
    // Select next item if current was removed
    if (selectedItemId === itemId) {
      const remainingItems = items.filter(i => i.planItem.id !== itemId);
      setSelectedItemId(remainingItems[0]?.planItem.id ?? null);
    }
  };

  const handleExecute = async () => {
    const result = await executeApproved(projectId, associationId);
      onExportComplete();
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Loading state
  if (phase === 'loading') {
    return (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            </div>
          </div>
          <p className="text-text-secondary text-sm font-medium mt-5">Preparing export review...</p>
        </div>
      </ModalShell>
    );
  }

  // Error with no items
  if (error && items.length === 0) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-danger/15 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-text-primary font-semibold mb-2">Failed to load review</h3>
        </div>
      </ModalShell>
    );
  }

  // Empty queue
  if (items.length === 0) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-surface-3 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-text-primary font-semibold mb-2">No items to export</h3>
          </p>
          <button onClick={handleClose} className="btn btn-secondary">Close</button>
        </div>
      </ModalShell>
    );
  }

  // Complete state
  if (phase === 'complete' && exportResult) {
    const successCount = exportResult.created.length + exportResult.updated.length;
    const failureCount = exportResult.errors.length;

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mb-5 relative">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-success/10 animate-ping" />
          </div>
          <h3 className="text-text-primary text-lg font-semibold mb-2">Export complete</h3>
          <p className="text-text-secondary text-sm mb-1">
          </p>
          {failureCount > 0 && (
            <p className="text-danger text-sm mb-4">{failureCount} failed</p>
          )}

          {(exportResult.created.length > 0 || exportResult.updated.length > 0) && (
            <div className="w-full max-w-sm mt-4 mb-6 p-4 rounded-xl bg-surface-2 border border-border-default space-y-3">
              {exportResult.created.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-text-secondary font-mono flex-1">
                    {exportResult.created.map(c => c.jira_key).join(', ')}
                  </span>
                </div>
              )}
              {exportResult.updated.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-text-secondary font-mono flex-1">
                    {exportResult.updated.map(u => u.jira_key).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>
      </ModalShell>
    );
  }

  // Main review view - Split layout
  const isExporting = phase === 'exporting';

  return (
      {/* Split view container */}
        {/* Left panel - Item list */}
          {/* List header */}
              <button
                onClick={handleToggleAll}
                disabled={validItems.length === 0}
                className="group flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className={`
                  ${allValidChecked
                    ? 'bg-accent border-accent'
                  }
                `}>
                  {allValidChecked && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                  Select all
                </span>
              </button>
              </span>
            </div>
          </div>

          {/* Item list */}
                  key={item.planItem.id}
                  item={item}
                />
              ))}
            </div>
          </div>
        </div>

            <DetailPanel
              item={selectedItem}
              onRemove={() => handleRemove(selectedItem.planItem.id)}
            />
          ) : (
              Select an item to view details
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
        <div className="flex items-center gap-3">
          {error && (
          )}
        </div>
          <button
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={checkedItems.length === 0 || isExporting}
            className={`
              ${checkedItems.length > 0 && !isExporting
                : 'bg-surface-3 text-text-muted cursor-not-allowed'
              }
            `}
          >
            {isExporting ? (
              <>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Export {checkedItems.length} item{checkedItems.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}

  return (
      <div
        onClick={onClose}
      />
              </svg>
            </div>
            <div>
            </div>
          </div>
        </div>
        {children}
      </div>
  );
}

interface ItemRowProps {
  item: SyncReviewItem;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

  const isChecked = item.decision === 'approved';
  const hasErrors = item.validationErrors.length > 0;
  const isCreate = item.queueEntry.operation === 'create';

  return (
    <div
      onClick={onSelect}
      className={`
        ${isSelected
        }
      `}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={hasErrors}
        className={`
          ${hasErrors
            : isChecked
              ? 'bg-accent border-accent cursor-pointer'
          }
        `}
      >
        {isChecked && !hasErrors && (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
          <span className={`
          `}>
            {isCreate ? 'New' : 'Upd'}
          </span>
            {item.planItem.title}
          </span>
        </div>
        {!isCreate && item.planItem.external_key && (
        )}
      </div>

      {/* Status indicators */}
        {hasErrors && (
            </svg>
          </div>
        )}
        {item.hasConflict && (
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

interface DetailPanelProps {
  item: SyncReviewItem;
  onRemove: () => void;
}

  const isCreate = item.queueEntry.operation === 'create';
  const hasErrors = item.validationErrors.length > 0;

  return (
          <div className="min-w-0 flex-1">
              <span className={`
              `}>
                {isCreate ? 'Create' : 'Update'}
              </span>
              {item.resolvedType && (
              )}
              {!isCreate && item.planItem.external_key && (
              )}
            </div>
            {isCreate && item.resolvedParent && (
                Creating in <span className="text-text-secondary font-mono">{item.resolvedParent}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {hasErrors && (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
              {item.validationErrors.map((err, i) => (
              ))}
            </div>
          </div>
        </div>
      )}

      </div>

        <button
          onClick={onRemove}
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Remove from queue</span>
        </button>
      </div>
  );
}
