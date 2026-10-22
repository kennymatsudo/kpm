/**
 * Actions Settings Component
 *
 * Actions are saved prompts that either run when invoked from the command palette
 * or on a trigger. What an action may do is a capability grant rather than an
 * output mode, so the same action can report a finding and write a file.
 *
 * Validation runs on the form as you edit and blocks Save, so an action that
 * cannot run is never stored.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClaudeModel } from '../../../shared/types';
import { useModelCatalogStore } from '../../stores/modelCatalogStore';
import {
  ACTION_CAPABILITIES,
  ACTION_CAPABILITY_LABELS,
  ACTION_TRIGGER_EVENTS,
  formatTrigger,
  getActionValidationIssues,
  isAutomatic,
  toEditable,
  type ActionCapability,
  type ActionDefinition,
  type ActionEditable,
  type ActionIcon,
  type ActionTrigger,
  type ActionTriggerEvent,
} from '../../../shared/actions';
import { useActionStore } from '../../stores/actionStore';
import { LoadingSpinner } from '../ui/LoadingButton';
import { toast } from '../../stores/toastStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

interface Props {
  currentProjectId?: string | null;
}

const ICON_OPTIONS: { value: ActionIcon; label: string }[] = [
  { value: 'document', label: 'Document' },
  { value: 'chart', label: 'Chart' },
  { value: 'check', label: 'Check' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'clipboard', label: 'Clipboard' },
];

const INTERVAL_OPTIONS = [
  { minutes: 5, label: 'Every 5 minutes' },
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 240, label: 'Every 4 hours' },
  { minutes: 1440, label: 'Daily' },
];

const TRIGGER_KIND_OPTIONS = [
  { value: 'manual', label: 'Only when I run it' },
  { value: 'interval', label: 'On a schedule' },
  { value: 'event', label: 'When something happens' },
];

const EVENT_OPTIONS: { value: ActionTriggerEvent; label: string }[] = ACTION_TRIGGER_EVENTS.map(
  (event) => ({ value: event, label: formatTrigger({ kind: 'event', event }) })
);

const FOLLOW_MODEL_OPTION = { value: 'default', label: 'Follow my model setting' };

function blankAction(projectId: string | null): ActionEditable {
  return {
    name: '',
    description: '',
    projectId,
    prompt: '',
    icon: 'document',
    keywords: '',
    trigger: { kind: 'manual' },
    enabled: false,
    capabilities: ['read_project'],
    manualRun: 'headless',
    targetType: 'none',
    model: null,
  };
}

const inputClass =
  'w-full px-3.5 py-2.5 bg-surface-2 border border-border-subtle rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface-1 transition-all';
const labelClass = 'block text-xs font-medium text-text-secondary uppercase tracking-wide';
const selectTriggerClass =
  'w-full flex items-center justify-between px-3.5 py-2.5 bg-surface-2 border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface-1 transition-all cursor-pointer';

function ChevronDown() {
  return (
    <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function Dropdown({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={selectTriggerClass}>
        <SelectValue />
        <ChevronDown />
      </SelectTrigger>
      <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <SelectItemText>{option.label}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ActionsSettings({ currentProjectId }: Props) {
  const actions = useActionStore((state) => state.actions);
  const selectedActionId = useActionStore((state) => state.selectedActionId);
  const isLoading = useActionStore((state) => state.isLoading);
  const storeError = useActionStore((state) => state.error);
  const history = useActionStore((state) => state.history);
  const loadActions = useActionStore((state) => state.loadActions);
  const selectAction = useActionStore((state) => state.selectAction);
  const createAction = useActionStore((state) => state.create);
  const updateAction = useActionStore((state) => state.update);
  const removeAction = useActionStore((state) => state.remove);
  const runNow = useActionStore((state) => state.runNow);
  const claudeModels = useModelCatalogStore((state) => state.catalog.claude);
  const modelOptions = useMemo(
    () => [FOLLOW_MODEL_OPTION, ...claudeModels.map((model) => ({ value: model.id, label: model.label }))],
    [claudeModels],
  );

  const [draft, setDraft] = useState<ActionEditable>(() => blankAction(currentProjectId ?? null));
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selected = actions.find((action) => action.id === selectedActionId) ?? null;

  useEffect(() => {
    if (currentProjectId) void loadActions(currentProjectId);
  }, [currentProjectId, loadActions]);

  useEffect(() => {
    if (storeError) toast.error(storeError);
  }, [storeError]);

  useEffect(() => {
    if (selected && !isCreating) setDraft(toEditable(selected));
  }, [selected, isCreating]);

  const issues = useMemo(() => getActionValidationIssues(draft), [draft]);
  const canSave = draft.name.trim().length > 0 && draft.prompt.trim().length > 0 && issues.length === 0;

  const patch = useCallback((updates: Partial<ActionEditable>) => {
    setDraft((current) => ({ ...current, ...updates }));
  }, []);

  const handleNew = () => {
    selectAction(null);
    setDraft(blankAction(currentProjectId ?? null));
    setIsCreating(true);
  };

  const handleSelect = (action: ActionDefinition) => {
    setIsCreating(false);
    selectAction(action.id);
    setDraft(toEditable(action));
  };

  const handleTriggerKindChange = (kind: string) => {
    const next: ActionTrigger =
      kind === 'interval'
        ? { kind: 'interval', minutes: 60 }
        : kind === 'event'
          ? { kind: 'event', event: 'app_opened' }
          : { kind: 'manual' };
    // A trigger only fires while enabled, and a manual action has nothing to enable.
    patch({ trigger: next, enabled: next.kind !== 'manual' ? draft.enabled : false });
  };

  const toggleCapability = (capability: ActionCapability) => {
    patch({
      capabilities: draft.capabilities.includes(capability)
        ? draft.capabilities.filter((entry) => entry !== capability)
        : [...draft.capabilities, capability],
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (isCreating) {
        const created = await createAction(draft);
        if (created) {
          setIsCreating(false);
          toast.success(`Created "${created.name}"`);
        }
      } else if (selected) {
        const ok = await updateAction(selected.id, draft);
        if (ok) toast.success('Saved');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = await removeAction(selected.id);
    if (ok) {
      toast.success(`Deleted "${selected.name}"`);
      setDraft(blankAction(currentProjectId ?? null));
    }
  };

  if (!currentProjectId) {
    return (
      <div className="px-5 py-8 text-sm text-text-secondary">
        Open a project to manage its actions.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 px-5 py-4 flex flex-col min-w-0">
      <div className="grid grid-cols-[240px_1fr] gap-5 min-w-0 flex-1 min-h-0">
        <div className="flex flex-col min-w-0 min-h-0">
          <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
            <h4 className={`${labelClass} truncate`}>Actions</h4>
            <button
              onClick={handleNew}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent-subtle rounded-md transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          </div>

          <div className="bg-surface-2/50 rounded-xl p-2 flex-1 min-h-0 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner className="w-5 h-5 text-text-muted" />
              </div>
            ) : actions.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-muted">
                No actions yet.
              </p>
            ) : (
              <div className="space-y-1">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleSelect(action)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      action.id === selectedActionId && !isCreating
                        ? 'bg-accent-subtle text-text-primary'
                        : 'text-text-secondary hover:bg-surface-3'
                    }`}
                  >
                    <span className="block text-sm truncate">{action.name}</span>
                    <span className="block text-xs text-text-muted truncate">
                      {formatTrigger(action.trigger)}
                      {isAutomatic(action.trigger) && !action.enabled ? ' · paused' : ''}
                      {action.projectId === null ? ' · all projects' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="e.g., Weekly digest, Doc drift check"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>
                Description <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="Shown in the command palette"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Prompt</label>
              <textarea
                value={draft.prompt}
                onChange={(event) => patch({ prompt: event.target.value })}
                rows={8}
                placeholder="What should this action do?"
                className={`${inputClass} font-mono resize-y`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Runs</label>
                <Dropdown
                  label="Runs"
                  value={draft.trigger.kind}
                  onChange={handleTriggerKindChange}
                  options={TRIGGER_KIND_OPTIONS}
                />
              </div>

              {draft.trigger.kind === 'interval' && (
                <div className="space-y-1.5">
                  <label className={labelClass}>How often</label>
                  <Dropdown
                    label="How often"
                    value={String(draft.trigger.minutes)}
                    onChange={(next) => patch({ trigger: { kind: 'interval', minutes: Number(next) } })}
                    options={INTERVAL_OPTIONS.map((option) => ({
                      value: String(option.minutes),
                      label: option.label,
                    }))}
                  />
                </div>
              )}

              {draft.trigger.kind === 'event' && (
                <div className="space-y-1.5">
                  <label className={labelClass}>When</label>
                  <Dropdown
                    label="When"
                    value={draft.trigger.event}
                    onChange={(next) => patch({ trigger: { kind: 'event', event: next as ActionTriggerEvent } })}
                    options={EVENT_OPTIONS}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Allowed to</label>
              <div className="space-y-1.5 bg-surface-2/50 rounded-xl p-3">
                {ACTION_CAPABILITIES.map((capability) => (
                  <label
                    key={capability}
                    className="flex items-start gap-2.5 text-sm text-text-secondary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draft.capabilities.includes(capability)}
                      onChange={() => toggleCapability(capability)}
                      className="mt-0.5 accent-accent"
                    />
                    <span>{ACTION_CAPABILITY_LABELS[capability]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Model</label>
                <Dropdown
                  label="Model"
                  value={draft.model ?? 'default'}
                  onChange={(next) => patch({ model: next === 'default' ? null : (next as ClaudeModel) })}
                  options={modelOptions}
                />
              </div>

              {!isAutomatic(draft.trigger) && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Result</label>
                  <Dropdown
                    label="Result"
                    value={draft.manualRun}
                    onChange={(next) => patch({ manualRun: next === 'chat' ? 'chat' : 'headless' })}
                    options={[
                      { value: 'headless', label: 'Run in the background' },
                      { value: 'chat', label: 'Open in chat' },
                    ]}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Icon</label>
                <Dropdown
                  label="Icon"
                  value={draft.icon}
                  onChange={(next) => patch({ icon: next as ActionIcon })}
                  options={ICON_OPTIONS}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>
                  Keywords <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={draft.keywords}
                  onChange={(event) => patch({ keywords: event.target.value })}
                  placeholder="comma, separated"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Available in</label>
              <Dropdown
                label="Available in"
                value={draft.projectId === null ? 'all' : 'this'}
                onChange={(next) => patch({ projectId: next === 'all' ? null : currentProjectId })}
                options={[
                  { value: 'this', label: 'This project only' },
                  { value: 'all', label: 'Every project' },
                ]}
              />
            </div>

            {isAutomatic(draft.trigger) && (
              <label className="flex items-center gap-2.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => patch({ enabled: event.target.checked })}
                  className="accent-accent"
                />
                <span>Let this trigger run</span>
              </label>
            )}

            {issues.length > 0 && (
              <div className="space-y-1 px-3 py-2.5 rounded-lg bg-surface-3 text-sm text-text-secondary">
                {issues.map((issue, index) => (
                  <p key={index}>{issue.message}</p>
                ))}
              </div>
            )}

            {selected && !isCreating && history.length > 0 && (
              <div className="space-y-1.5">
                <label className={labelClass}>Recent runs</label>
                <div className="space-y-1 bg-surface-2/50 rounded-xl p-3">
                  {history.slice(0, 5).map((run) => (
                    <p key={run.id} className="text-xs text-text-muted truncate">
                      <span className="text-text-secondary">{run.outcome}</span>
                      {' · '}
                      {run.summary ?? run.error ?? 'no detail'}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 shrink-0">
            <button
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Create' : 'Save'}
            </button>
            {selected && !isCreating && (
              <>
                <button onClick={() => void runNow(selected.id)} className="btn">
                  Run now
                </button>
                <button onClick={handleDelete} className="btn text-danger">
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
