import { useEffect, useMemo, useState } from 'react';
import { DiffRenderer, StatusTransitionView } from '../DiffRenderer';
import { CloseIcon } from '../../icons';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

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
    updateCustomFieldOverrides,
    reset,
  } = useSyncReviewStore();


  // Start review on mount
  useEffect(() => {
    void startReview(projectId, associationId);
    return () => reset();
  }, [projectId, associationId, startReview, reset]);

  // Auto-close modal after export completes successfully
  useEffect(() => {
    if (phase === 'complete' && exportResult) {
      const timer = setTimeout(() => {
        handleClose();
      }, 1500); // Brief delay to show success message
      return () => clearTimeout(timer);
    }
  }, [phase, exportResult]);

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
    console.log('[SyncReviewModal] Starting export...');
    const result = await executeApproved(projectId, associationId);
    console.log('[SyncReviewModal] Export result:', result);
    // Always refresh plan items after export, even if some items failed
    // Items that succeeded have their external_key updated in DB
    if (result) {
      console.log('[SyncReviewModal] Calling onExportComplete...');
      onExportComplete();
    } else {
      console.log('[SyncReviewModal] No result, skipping refresh');
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
              <LoadingSpinner className="w-6 h-6" color="accent" />
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
          <p className="text-text-secondary text-sm text-center mb-6" style={{ maxWidth: '20rem' }}>
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

          <p className="text-text-muted text-xs">Closing automatically...</p>
        </div>
      </ModalShell>
    );
  }

  // Main review view - Split layout
  const isExporting = phase === 'exporting';

  return (
      {/* Split view container */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left panel - Item list */}
        <div className="w-64 flex-shrink-0 border-r border-border-subtle flex flex-col" style={{ background: 'var(--bg-canvas)' }}>
          {/* List header */}
          <div className="px-3 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleAll}
                disabled={validItems.length === 0}
                className="group flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className={`
                  w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all duration-150
                  ${allValidChecked
                    ? 'bg-accent border-accent'
                    : 'border-text-muted/40 group-hover:border-text-muted'
                  }
                `}>
                  {allValidChecked && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                  Select all
                </span>
              </button>
                {checkedItems.length}/{items.length}
              </span>
            </div>
          </div>

          {/* Item list */}
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
            <div className="space-y-0.5">
                  key={item.planItem.id}
                  item={item}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--surface-0)' }}>
            <DetailPanel
              item={selectedItem}
              onRemove={() => handleRemove(selectedItem.planItem.id)}
              hasIssueType={!!selectedIssueTypeId}
              issueTypeId={selectedIssueTypeId}
              customFields={customFields}
              customFieldDefaults={customFieldDefaults}
              isLoadingCustomFields={isLoadingCustomFields}
              customFieldsError={customFieldsError}
              customFieldDraft={customFieldDraft}
              customFieldDirty={customFieldDirty}
              onCustomFieldChange={handleCustomFieldChange}
              onSaveCustomFields={handleSaveCustomFields}
              onClearCustomFields={handleClearCustomFields}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
              Select an item to view details
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-between flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
        <div className="flex items-center gap-3">
          {error && (
            <p className="text-xs text-danger max-w-xs truncate">{error}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleClose}
            disabled={isExporting}
            className="px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={checkedItems.length === 0 || isExporting}
            className={`
              px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-2
              ${checkedItems.length > 0 && !isExporting
                ? 'bg-accent text-white hover:bg-accent-hover active:scale-[0.98] cursor-pointer'
                : 'bg-surface-3 text-text-muted cursor-not-allowed'
              }
            `}
          >
            {isExporting ? (
              <>
                <LoadingSpinner className="w-3.5 h-3.5" color="white" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isOpen: true,
    onEscape: onClose,
    restoreFocus: true,
  });

  return (
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        className="dialog-content relative flex flex-col overflow-hidden"
        style={{
          maxWidth: wide ? '60rem' : '32rem',
          height: wide ? '75vh' : '500px',
          maxHeight: '800px',
          minHeight: wide ? '580px' : '400px'
        }}
      >
        {/* Header - compact and refined */}
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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
          ? 'bg-accent/8 ring-1 ring-accent/20'
          : 'hover:bg-surface-1'
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
          w-4 h-4 rounded border-[1.5px] flex-shrink-0 flex items-center justify-center transition-all duration-100
          ${hasErrors
            ? 'border-border-default bg-surface-2 cursor-not-allowed opacity-40'
            : isChecked
              ? 'bg-accent border-accent cursor-pointer'
              : 'border-text-muted/30 hover:border-accent/50 cursor-pointer'
          }
        `}
      >
        {isChecked && !hasErrors && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`
            ${isCreate ? 'bg-success/12 text-success' : 'bg-info/12 text-info'}
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
      <div className="flex items-center gap-1 flex-shrink-0">
        {hasErrors && (
          <div className="w-4 h-4 rounded-full bg-danger/12 flex items-center justify-center" title={item.validationErrors.join(', ')}>
            <svg className="w-2.5 h-2.5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
        )}
        {item.hasConflict && (
            <svg className="w-2.5 h-2.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
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
  hasIssueType: boolean;
  issueTypeId: string | null;
  customFields: JiraCustomField[];
  customFieldDefaults: CustomFieldValues | null;
  isLoadingCustomFields: boolean;
  customFieldsError: string | null;
  customFieldDraft: CustomFieldValues;
  customFieldDirty: boolean;
  onCustomFieldChange: (fieldId: string, value: string) => void;
  onSaveCustomFields: () => void;
  onClearCustomFields: () => void;
}

function DetailPanel({
  item,
  onRemove,
  hasIssueType,
  customFields,
  customFieldDefaults,
  isLoadingCustomFields,
  customFieldsError,
  customFieldDraft,
  customFieldDirty,
  onCustomFieldChange,
  onSaveCustomFields,
  onClearCustomFields,
}: DetailPanelProps) {
  const isCreate = item.queueEntry.operation === 'create';
  const hasErrors = item.validationErrors.length > 0;
  const [customFieldsExpanded, setCustomFieldsExpanded] = useState(true);

  // Get the default value for a field (project-wide defaults)
  const getDefaultValue = (fieldId: string): string | undefined => {
    return customFieldDefaults?.[fieldId];
  };

  // Get display label for a default value (for option fields, resolve to the option's display value)
  const getDefaultDisplayValue = (field: JiraCustomField): string | undefined => {
    const defaultValue = getDefaultValue(field.id);
    if (!defaultValue) return undefined;

    // For option fields, find the display value
    if (field.type === 'option' && field.allowedValues) {
      const option = field.allowedValues.find(opt => opt.id === defaultValue);
      return option?.value;
    }

    return defaultValue;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Detail header - compact */}
      <div className="px-4 py-3 border-b border-border-subtle flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`
                ${isCreate ? 'bg-success/12 text-success' : 'bg-info/12 text-info'}
              `}>
                {isCreate ? 'Create' : 'Update'}
              </span>
              {item.resolvedType && (
              )}
              {!isCreate && item.planItem.external_key && (
              )}
              {item.hasConflict && (
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">{item.planItem.title}</h3>
            {isCreate && item.resolvedParent && (
                Creating in <span className="text-text-secondary font-mono">{item.resolvedParent}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Validation errors - inline */}
      {hasErrors && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-danger/8 border border-danger/15 flex-shrink-0">
          <div className="flex items-start gap-2">
            <svg className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-0.5">
              {item.validationErrors.map((err, i) => (
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          {/* Title Section */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {!isCreate && !item.diffs?.summary?.hasChanges && (
              )}
            </div>
            <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
              {isCreate ? (
                <span className="text-xs text-text-secondary leading-relaxed">
                  {item.planItem.title || <span className="text-text-tertiary italic">Empty</span>}
                </span>
              ) : item.diffs?.summary?.hasChanges ? (
                <DiffRenderer diff={item.diffs.summary} className="text-xs" />
              ) : (
                <span className="text-xs text-text-muted">
                  {item.jiraCurrent?.summary || item.planItem.title || <span className="text-text-tertiary italic">Empty</span>}
                </span>
              )}
            </div>
          </div>

          {/* Description Section - with proper height constraints */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {!isCreate && !item.diffs?.description?.hasChanges && (
              )}
            </div>
            <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle max-h-48 overflow-y-auto">
              {isCreate ? (
                <span className="font-mono text-xs text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
                </span>
              ) : item.diffs?.description?.hasChanges ? (
                <DiffRenderer diff={item.diffs.description} className="text-xs" />
              ) : (
                <span className="font-mono text-xs text-text-muted whitespace-pre-wrap break-words leading-relaxed">
                </span>
              )}
            </div>
          </div>

          {/* Status Transition */}
          {!isCreate && item.statusTransition && (
          )}

          {/* Custom Fields - Collapsible Section */}
          <div className="border border-border-subtle rounded-lg overflow-hidden" style={{ background: 'var(--surface-1)' }}>
            <button
              onClick={() => setCustomFieldsExpanded(!customFieldsExpanded)}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-3 h-3 text-text-muted transition-transform duration-150 ${customFieldsExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                  Custom Fields
                </span>
                {customFields.length > 0 && (
                    {customFields.length} field{customFields.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {customFieldDirty && (
              )}
            </button>

            {customFieldsExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-border-subtle">
                {customFieldsError && (
                    {customFieldsError}
                  </div>
                )}

                {!customFieldsError && isLoadingCustomFields && (
                    <LoadingSpinner className="w-3 h-3" />
                    Loading custom fields...
                  </div>
                )}

                {!customFieldsError && !isLoadingCustomFields && customFields.length === 0 && (
                    {hasIssueType ? 'No configurable custom fields for this issue type.' : 'Issue type not resolved yet.'}
                  </div>
                )}

                {!customFieldsError && !isLoadingCustomFields && customFields.length > 0 && (
                  <div className="space-y-2 mt-2">
                      Leave empty to use defaults. Overrides apply only to this item.
                    </p>
                    {customFields.map((field) => {
                      const defaultDisplay = getDefaultDisplayValue(field);
                      const hasDefault = !!defaultDisplay;

                      return (
                        <div key={field.id} className="p-2 rounded bg-surface-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {field.required && (
                                Req
                              </span>
                            )}
                              {field.type === 'option' ? 'Select' : 'Text'}
                            </span>
                          </div>
                          {field.type === 'option' && field.allowedValues ? (
                            >
                          ) : (
                            <input
                              type="text"
                              value={customFieldDraft[field.id] || ''}
                              onChange={(e) => onCustomFieldChange(field.id, e.target.value)}
                              placeholder={hasDefault ? `Default: ${defaultDisplay}` : 'No default set'}
                            />
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={onSaveCustomFields}
                        disabled={!customFieldDirty}
                          customFieldDirty
                            ? 'bg-accent text-white hover:bg-accent-hover cursor-pointer'
                            : 'bg-surface-2 text-text-muted cursor-not-allowed'
                        }`}
                      >
                        Save Overrides
                      </button>
                      <button
                        onClick={onClearCustomFields}
                        disabled={!customFieldDirty && Object.keys(customFieldDraft).length === 0}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail footer - compact */}
      <div className="px-4 py-2 border-t border-border-subtle flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
        <button
          onClick={onRemove}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Remove from queue</span>
        </button>
      </div>
    </div>
  );
}
