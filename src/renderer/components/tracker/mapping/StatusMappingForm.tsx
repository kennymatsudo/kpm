import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LoadingSpinner } from '../../ui/LoadingButton';
import {
  NONE_VALUE,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectItemText,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select';
import { useTrackerMetadataStore } from '../../../stores';
import type { TrackerStatusOption } from '../../../stores/tracker/useMetadataStore';
import { useStatusMapping } from '../settings/hooks';
import type { StatusCategory, StatusMapping, TrackerType } from '../../../../shared/types';
import { MAPPABLE_KPM_CATEGORIES } from './categories';

interface Props {
  associationId: string;
  projectKey: string;
  trackerType: TrackerType;
  currentMapping: StatusMapping | null;
  onSaved: (mapping: StatusMapping | null) => void;
  onCancel: () => void;
  /** When true, render Cancel/Save side-by-side at the bottom of the form. */
  showFooter?: boolean;
}

const EMPTY_STATUSES: TrackerStatusOption[] = [];

function getCategoryLabel(key: string): string {
  switch (key) {
    case 'new':
      return 'To Do';
    case 'indeterminate':
      return 'In Progress';
    case 'done':
      return 'Done';
    default:
      return key;
  }
}

export function StatusMappingForm({
  associationId,
  projectKey,
  trackerType,
  currentMapping,
  onSaved,
  onCancel,
  showFooter = true,
}: Props) {
  // Cache key in useMetadataStore is `${trackerType}:${projectKey}` — read
  // and write under the same key or the data won't show up for Linear.
  const cacheKey = `${trackerType}:${projectKey}`;

  const {
    jiraStatuses,
    isLoadingStatuses,
    statusesError,
    loadStatuses,
  } = useTrackerMetadataStore(
    useShallow((state) => ({
      jiraStatuses: state.statusesByProject[cacheKey] ?? EMPTY_STATUSES,
      isLoadingStatuses: state.loadingStatusesFor.has(cacheKey),
      statusesError: state.statusesErrorByProject[cacheKey] || null,
      loadStatuses: state.loadStatuses,
    }))
  );

  const {
    statusMapping: mapping,
    isSavingStatus: isSaving,
    statusError: saveError,
    handleStatusMappingChange,
    handleSaveStatusMapping,
  } = useStatusMapping({
    associationId,
    initialMapping: currentMapping,
  });

  // Track which categories were filled by the suggester (vs. the user) so we
  // can badge them in the UI. A user-edited row clears its auto badge.
  const [autoFilled, setAutoFilled] = useState<Partial<Record<StatusCategory, boolean>>>({});

  const isLoading = isLoadingStatuses && jiraStatuses.length === 0;
  const error = statusesError || saveError;

  useEffect(() => {
    if (projectKey) {
      void loadStatuses(projectKey, trackerType);
    }
  }, [projectKey, trackerType, loadStatuses]);

  const suggestion = useMemo(
    () => (jiraStatuses.length > 0 ? suggestStatusMapping(jiraStatuses) : null),
    [jiraStatuses]
  );

  // Auto-fill on first load when the association has no mapping at all. Only
  // fills empty slots, never overwrites — and only the first time we see the
  // statuses for an empty mapping. Subsequent edits won't trigger this.
  const hasInitialMapping = !!currentMapping && Object.keys(currentMapping).length > 0;
  const [autofilledOnLoad, setAutofilledOnLoad] = useState(false);
  useEffect(() => {
    if (autofilledOnLoad || hasInitialMapping || !suggestion) return;
    if (Object.keys(suggestion.mapping).length === 0) return;
    for (const [category, name] of Object.entries(suggestion.mapping)) {
      handleStatusMappingChange(category as keyof StatusMapping, name);
    }
    setAutoFilled(Object.fromEntries(
      Object.keys(suggestion.mapping).map((c) => [c, true])
    ));
    setAutofilledOnLoad(true);
  }, [autofilledOnLoad, hasInitialMapping, suggestion, handleStatusMappingChange]);

  const handleSuggestClick = () => {
    if (!suggestion) return;
    const newAuto: Partial<Record<StatusCategory, boolean>> = { ...autoFilled };
    for (const [category, name] of Object.entries(suggestion.mapping)) {
      const cat = category as keyof StatusMapping;
      // Only fill empty slots — don't overwrite user choices.
      if (!mapping[cat]) {
        handleStatusMappingChange(cat, name);
        newAuto[category as StatusCategory] = true;
      }
    }
    setAutoFilled(newAuto);
  };

  const handleManualChange = (category: keyof StatusMapping, value: string) => {
    handleStatusMappingChange(category, value);
    if (autoFilled[category]) {
      setAutoFilled((prev) => ({ ...prev, [category]: false }));
    }
  };

  const filledCount = Object.values(mapping).filter(Boolean).length;
  const suggestedFillableCount = suggestion
    ? Object.entries(suggestion.mapping).filter(
        ([cat]) => !mapping[cat as keyof StatusMapping]
      ).length
    : 0;

  const handleSave = async () => {
    const result = await handleSaveStatusMapping();
    if (result.success) {
      onSaved(result.savedMapping);
    }
  };

  const statusesByCategory = jiraStatuses.reduce((acc, status) => {
    const cat = status.categoryKey;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(status);
    return acc;
  }, {} as Record<string, TrackerStatusOption[]>);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-10">
        <LoadingSpinner className="w-5 h-5 text-info mb-2" />
        <p className="text-text-secondary text-xs">Loading available statuses...</p>
      </div>
    );
  }

  if (error && jiraStatuses.length === 0) {
    return (
      <div className="text-center py-6">
        <h3 className="text-text-primary font-semibold text-sm mb-2">Failed to load statuses</h3>
        <p className="text-text-secondary text-xs mb-3">{error}</p>
        <button onClick={onCancel} className="btn btn-secondary text-xs">Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xxs text-text-tertiary leading-snug">
          {filledCount}/{MAPPABLE_KPM_CATEGORIES.length} categories mapped
        </p>
        {suggestedFillableCount > 0 && (
          <button
            type="button"
            onClick={handleSuggestClick}
            className="inline-flex items-center gap-1 text-xxs font-medium text-accent hover:text-accent-hover cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Auto-fill {suggestedFillableCount} from tracker
          </button>
        )}
      </div>

      <div className="space-y-3">
        {MAPPABLE_KPM_CATEGORIES.map((category) => (
          <div key={category.key} className="p-3 rounded-xl bg-surface-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <span className="text-text-primary text-sm font-medium">{category.label}</span>
                <p className="text-text-tertiary text-xs">{category.description}</p>
              </div>
              {autoFilled[category.key] && mapping[category.key] && (
                <span className="text-xxs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-info-muted text-info">
                  Auto
                </span>
              )}
            </div>
            <Select
              value={mapping[category.key] || NONE_VALUE}
              onValueChange={(next) => handleManualChange(category.key, next === NONE_VALUE ? '' : next)}
            >
              <SelectTrigger
                aria-label={`Tracker status mapping for ${category.label}`}
                className="w-full flex items-center justify-between bg-surface-3 text-text-primary text-xs rounded-lg px-2 py-1.5 border border-border-default focus:border-info focus:outline-none cursor-pointer"
              >
                <SelectValue />
                <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </SelectTrigger>
              <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)', maxHeight: 320 }}>
                <SelectItem value={NONE_VALUE}>
                  <SelectItemText>-- Not mapped --</SelectItemText>
                </SelectItem>
                {Object.entries(statusesByCategory).map(([catKey, statuses]) => (
                  <SelectGroup key={catKey}>
                    <SelectLabel className="px-2 py-1 text-xxs font-medium uppercase tracking-wider text-text-muted">
                      {getCategoryLabel(catKey)}
                    </SelectLabel>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.name}>
                        <SelectItemText>{status.name}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-xs p-3 rounded-lg bg-danger-muted text-danger border border-danger/20 flex items-start gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {showFooter && (
        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-xs">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary flex-1 text-xs flex items-center justify-center gap-1.5"
          >
            {isSaving ? (
              <>
                <LoadingSpinner className="w-3.5 h-3.5" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save mappings</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
