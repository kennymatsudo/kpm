import { useEffect, useMemo, useState } from 'react';
import { useSyncReviewStore, useTrackerStore } from '../../../stores';
import { DiffRenderer, StatusTransitionView } from '../DiffRenderer';
import { StatusMappingForm } from '../mapping/StatusMappingForm';
import type { CustomFieldValues, JiraCustomField, StatusMapping, SyncReviewItem, TrackerType } from '../../../../shared/types';
import { CloseIcon } from '../../icons';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { Z_INDEX } from '../../../constants/zIndex';
import { ModalLayerProvider } from '../../ui/ModalLayerContext';
import {
  NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select';
import { useAssociationData, useCustomFieldManagement, useSyncItemSelection } from './hooks';
import { trackerLabelFor } from '../shared/trackerDisplay';

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

  // Extracted hooks
  const { projectKey, trackerType, customFieldDefaults, statusMapping } = useAssociationData({ projectId, associationId });
  const loadAssociations = useTrackerStore((state) => state.loadAssociations);
  const [mappingMode, setMappingMode] = useState(false);
  const trackerLabel = trackerLabelFor(trackerType);
  const { selectedItemId, setSelectedItemId, selectedItem } = useSyncItemSelection({ items });
  const {
    customFields,
    isLoadingCustomFields,
    customFieldsError,
    customFieldDraft,
    customFieldDirty,
    selectedIssueTypeId,
    handleCustomFieldChange,
    handleSaveCustomFields,
    handleClearCustomFields,
  } = useCustomFieldManagement({ projectKey, selectedItem, updateCustomFieldOverrides });

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
  // Build parent lookup for hierarchy display and auto-approval
  const itemMap = useMemo(() => {
    const map = new Map<string, SyncReviewItem>();
    for (const item of items) map.set(item.planItem.id, item);
    return map;
  }, [items]);

  // Build tree structure for sidebar display
  const itemTree = useMemo(() => {
    const itemIds = new Set(items.map(i => i.planItem.id));
    const childrenOf = new Map<string | null, SyncReviewItem[]>();

    for (const item of items) {
      // Nest under parent only if parent is also in the review list
      const parentKey = item.planItem.parent_id && itemIds.has(item.planItem.parent_id)
        ? item.planItem.parent_id
        : null;
      const siblings = childrenOf.get(parentKey) ?? [];
      siblings.push(item);
      childrenOf.set(parentKey, siblings);
    }

    return { roots: childrenOf.get(null) ?? [], childrenOf };
  }, [items]);

  const handleToggleItem = (itemId: string) => {
    const item = items.find(i => i.planItem.id === itemId);
    if (!item || item.validationErrors.length > 0) return;

    const newDecision = item.decision === 'approved' ? 'pending' : 'approved';
    setDecision(itemId, newDecision);

    // When approving a subtask, auto-approve its unsynced parent chain
    if (newDecision === 'approved') {
      let parentId = item.planItem.parent_id;
      while (parentId) {
        const parent = itemMap.get(parentId);
        if (!parent) break;
        if (!parent.planItem.external_key && parent.decision !== 'approved' && parent.validationErrors.length === 0) {
          setDecision(parentId, 'approved');
        }
        parentId = parent.planItem.parent_id;
      }
    }
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

  const handleMappingSaved = async (_saved: StatusMapping | null) => {
    // Reload associations so useAssociationData reflects the new mapping,
    // then re-run the preview so the export reflects it without losing
    // the user's queue/decision state.
    await loadAssociations(projectId);
    void startReview(projectId, associationId);
    setMappingMode(false);
  };

  // Loading state
  if (phase === 'loading') {
    return (
      <ModalShell onClose={handleClose} trackerLabel={trackerLabel}>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <LoadingSpinner className="w-6 h-6" color="accent" />
            </div>
          </div>
          <p className="text-text-secondary text-sm font-medium mt-5">Preparing export review...</p>
          <p className="text-text-muted text-xs mt-1.5">Fetching current {trackerLabel} state</p>
        </div>
      </ModalShell>
    );
  }

  // Error with no items
  if (error && items.length === 0) {
    return (
      <ModalShell onClose={handleClose} trackerLabel={trackerLabel}>
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
      <ModalShell onClose={handleClose} trackerLabel={trackerLabel}>
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
      <ModalShell onClose={handleClose} trackerLabel={trackerLabel}>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mb-5 relative">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-success/10 animate-ping" />
          </div>
          <h3 className="text-text-primary text-lg font-semibold mb-2">Export complete</h3>
          <p className="text-text-secondary text-sm mb-1">
            Successfully exported {successCount} item{successCount !== 1 ? 's' : ''} to {trackerLabel}
          </p>
          {failureCount > 0 && (
            <p className="text-danger text-sm mb-4">{failureCount} failed</p>
          )}

          {(exportResult.created.length > 0 || exportResult.updated.length > 0) && (
            <div className="w-full max-w-sm mt-4 mb-6 p-4 rounded-xl bg-surface-2 border border-border-default space-y-3">
              {exportResult.created.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xxs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-success/15 text-success">Created</span>
                  <span className="text-sm text-text-secondary font-mono flex-1">
                    {exportResult.created.map(c => c.jira_key).join(', ')}
                  </span>
                </div>
              )}
              {exportResult.updated.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xxs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-info/15 text-info">Updated</span>
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

  const headerAction = !mappingMode && projectKey ? (
    <button
      type="button"
      onClick={() => setMappingMode(true)}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xxs font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors cursor-pointer"
      title={`Configure status mappings for ${trackerLabel}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Mappings
    </button>
  ) : null;

  return (
    <ModalShell onClose={handleClose} wide trackerLabel={trackerLabel} headerAction={headerAction}>
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
                <span className="text-tiny font-medium text-text-muted group-hover:text-text-secondary transition-colors">
                  Select all
                </span>
              </button>
              <span className="text-xxs text-text-muted/70 ml-auto tabular-nums">
                {checkedItems.length}/{items.length}
              </span>
            </div>
          </div>

          {/* Item list */}
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
            <div className="space-y-0.5">
              {itemTree.roots.map((item) => (
                <ItemTreeNode
                  key={item.planItem.id}
                  item={item}
                  depth={0}
                  childrenOf={itemTree.childrenOf}
                  selectedItemId={selectedItemId}
                  onSelect={setSelectedItemId}
                  onToggle={handleToggleItem}
                  trackerLabel={trackerLabel}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right panel - Detail view OR mapping configuration takeover */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--surface-0)' }}>
          {mappingMode && projectKey && trackerType ? (
            <MappingPanel
              associationId={associationId}
              projectKey={projectKey}
              trackerType={trackerType}
              currentMapping={statusMapping}
              trackerLabel={trackerLabel}
              onSaved={(saved) => void handleMappingSaved(saved)}
              onBack={() => setMappingMode(false)}
            />
          ) : selectedItem ? (
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
              trackerLabel={trackerLabel}
              onConfigureMappings={projectKey ? () => setMappingMode(true) : undefined}
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

interface MappingPanelProps {
  associationId: string;
  projectKey: string;
  trackerType: TrackerType;
  currentMapping: StatusMapping | null;
  trackerLabel: string;
  onSaved: (mapping: StatusMapping | null) => void;
  onBack: () => void;
}

function MappingPanel({
  associationId,
  projectKey,
  trackerType,
  currentMapping,
  trackerLabel,
  onSaved,
  onBack,
}: MappingPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xxs font-medium text-text-tertiary hover:text-text-primary mb-1.5 cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to export
        </button>
        <h3 className="text-sm font-semibold text-text-primary leading-snug">Status Mappings</h3>
        <p className="text-xxs text-text-muted mt-0.5">
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <StatusMappingForm
          associationId={associationId}
          projectKey={projectKey}
          trackerType={trackerType}
          currentMapping={currentMapping}
          onSaved={onSaved}
          onCancel={onBack}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  trackerLabel: string;
  headerAction?: React.ReactNode;
}

function ModalShell({ children, onClose, wide, trackerLabel, headerAction }: ModalShellProps) {
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isOpen: true,
    onEscape: onClose,
    restoreFocus: true,
  });

  return (
    <ModalLayerProvider zIndex={Z_INDEX.modal}>
      <div className="dialog-overlay p-6" style={{ zIndex: Z_INDEX.modal }}>
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
              <h2 className="text-sm font-semibold text-text-primary leading-tight">Export to {trackerLabel}</h2>
              <p className="text-xxs text-text-muted">Review and sync selected items</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerAction}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
      </div>
    </ModalLayerProvider>
  );
}

interface ItemTreeNodeProps {
  item: SyncReviewItem;
  depth: number;
  childrenOf: Map<string | null, SyncReviewItem[]>;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  trackerLabel: string;
}

function ItemTreeNode({ item, depth, childrenOf, selectedItemId, onSelect, onToggle, trackerLabel }: ItemTreeNodeProps) {
  const children = childrenOf.get(item.planItem.id) ?? [];
  return (
    <>
      <ItemRow
        item={item}
        depth={depth}
        isSelected={selectedItemId === item.planItem.id}
        onSelect={() => onSelect(item.planItem.id)}
        onToggle={() => onToggle(item.planItem.id)}
        trackerLabel={trackerLabel}
      />
      {children.map((child) => (
        <ItemTreeNode
          key={child.planItem.id}
          item={child}
          depth={depth + 1}
          childrenOf={childrenOf}
          selectedItemId={selectedItemId}
          onSelect={onSelect}
          onToggle={onToggle}
          trackerLabel={trackerLabel}
        />
      ))}
    </>
  );
}

interface ItemRowProps {
  item: SyncReviewItem;
  depth?: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  trackerLabel: string;
}

function ItemRow({ item, depth = 0, isSelected, onSelect, onToggle, trackerLabel }: ItemRowProps) {
  const isChecked = item.decision === 'approved';
  const hasErrors = item.validationErrors.length > 0;
  const isCreate = item.queueEntry.operation === 'create';

  return (
    <div
      onClick={onSelect}
      className={`
        group relative flex items-center gap-2.5 py-2 rounded-lg cursor-pointer transition-all duration-100
        ${isSelected
          ? 'bg-accent/8 ring-1 ring-accent/20'
          : 'hover:bg-surface-1'
        }
      `}
      style={{ paddingLeft: `${10 + depth * 16}px`, paddingRight: 10 }}
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
          <span className={`text-tiny truncate leading-tight ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
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
          <div className="w-4 h-4 rounded-full bg-warning/12 flex items-center justify-center" title={`Modified in ${trackerLabel}`}>
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
  trackerLabel: string;
  onConfigureMappings?: () => void;
}

function DetailPanel({
  item,
  onRemove,
  hasIssueType,
  issueTypeId: _issueTypeId,
  customFields,
  customFieldDefaults,
  isLoadingCustomFields,
  customFieldsError,
  customFieldDraft,
  customFieldDirty,
  onCustomFieldChange,
  onSaveCustomFields,
  onClearCustomFields,
  trackerLabel,
  onConfigureMappings,
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
                <span className="text-xxs text-text-muted">{item.resolvedType.name}</span>
              )}
              {!isCreate && item.planItem.external_key && (
                <span className="text-xxs font-mono text-text-muted/80">{item.planItem.external_key}</span>
              )}
              {item.hasConflict && (
                  Modified in {trackerLabel}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">{item.planItem.title}</h3>
            {isCreate && item.resolvedParent && (
              <p className="text-xxs text-text-muted mt-1">
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
                <p key={i} className="text-tiny text-danger leading-tight">{err}</p>
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
              <span className="text-xxs font-semibold text-text-muted uppercase tracking-wider">Title</span>
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
              <span className="text-xxs font-semibold text-text-muted uppercase tracking-wider">Description</span>
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
            <StatusTransitionView
              transition={item.statusTransition}
              onConfigureMappings={onConfigureMappings}
            />
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
                <span className="text-xxs font-semibold text-text-muted uppercase tracking-wider">
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
                  <div className="text-xxs text-danger bg-danger/8 border border-danger/15 rounded px-2 py-1.5 mt-2">
                    {customFieldsError}
                  </div>
                )}

                {!customFieldsError && isLoadingCustomFields && (
                  <div className="flex items-center gap-2 text-xxs text-text-muted py-2">
                    <LoadingSpinner className="w-3 h-3" />
                    Loading custom fields...
                  </div>
                )}

                {!customFieldsError && !isLoadingCustomFields && customFields.length === 0 && (
                  <div className="text-xxs text-text-muted py-2">
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
                            <span className="text-tiny text-text-primary font-medium">{field.name}</span>
                            {field.required && (
                                Req
                              </span>
                            )}
                              {field.type === 'option' ? 'Select' : 'Text'}
                            </span>
                          </div>
                          {field.type === 'option' && field.allowedValues ? (
                            <Select
                              value={customFieldDraft[field.id] || NONE_VALUE}
                              onValueChange={(next) => onCustomFieldChange(field.id, next === NONE_VALUE ? '' : next)}
                            >
                              <SelectTrigger
                                aria-label={field.name}
                                className="w-full flex items-center justify-between bg-surface-3 text-text-primary text-tiny rounded px-2 py-1 border border-border-subtle focus:border-accent focus:outline-none cursor-pointer"
                              >
                                <SelectValue />
                                <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </SelectTrigger>
                              <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
                                <SelectItem value={NONE_VALUE}>
                                  <SelectItemText>
                                    {hasDefault ? `Default: ${defaultDisplay}` : '-- No default --'}
                                  </SelectItemText>
                                </SelectItem>
                                {field.allowedValues.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    <SelectItemText>{opt.value}</SelectItemText>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input
                              type="text"
                              value={customFieldDraft[field.id] || ''}
                              onChange={(e) => onCustomFieldChange(field.id, e.target.value)}
                              placeholder={hasDefault ? `Default: ${defaultDisplay}` : 'No default set'}
                              className="w-full bg-surface-3 text-text-primary text-tiny rounded px-2 py-1 border border-border-subtle focus:border-accent focus:outline-none placeholder:text-text-muted"
                            />
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={onSaveCustomFields}
                        disabled={!customFieldDirty}
                        className={`px-2.5 py-1 text-xxs font-medium rounded transition-all ${
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
                        className="px-2.5 py-1 text-xxs font-medium rounded text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
          className="flex items-center gap-1.5 px-2 py-1 text-xxs font-medium text-danger/70 hover:text-danger hover:bg-danger/8 rounded transition-all cursor-pointer"
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
