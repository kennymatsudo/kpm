import { useMemo } from 'react';
import { CONFIG_KIND_REGISTRY, describeConfigChange, type ConfigChange, type ConfigDiffEntry, type ConfigFieldChange } from '../../../shared/configKinds';
import { formatPlaybookStepTitle } from '../../../shared/playbooks';
import { DiffViewer } from '../ui/DiffViewer';

interface PendingConfigPanelProps {
  change: ConfigChange;
  error?: string;
  onApprove: () => void;
  onReject: () => void;
  isApplying?: boolean;
}

function FieldChange({ change }: { change: ConfigFieldChange }) {
  if (change.format === 'text') {
    return (
      <div className="space-y-1">
        <div className="text-xxs uppercase tracking-wide text-text-muted">{change.label}</div>
        <div className="overflow-hidden rounded border border-border-subtle">
          <DiffViewer oldContent={change.before || null} newContent={change.after} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="text-text-muted">{change.label}:</span>
      {change.before && <span className="text-text-muted line-through">{change.before}</span>}
      {change.before && change.after && <span className="text-text-muted" aria-hidden="true">&rarr;</span>}
      <span className="text-text-primary">{change.after ?? 'none'}</span>
    </div>
  );
}

function Entry({ entry }: { entry: ConfigDiffEntry }) {
  switch (entry.kind) {
    case 'renamed':
      return (
        <li className="text-sm text-text-primary">
          Renamed from <span className="text-text-muted line-through">{entry.before}</span> to {entry.after}
        </li>
      );
    case 'step-added':
    case 'step-removed':
      return (
        <li className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
          <div className={`text-sm font-medium ${entry.kind === 'step-added' ? 'text-success' : 'text-danger'}`}>
            {entry.kind === 'step-added' ? 'Added' : 'Removed'}: {formatPlaybookStepTitle(entry.stepId)}
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">{entry.summary}</div>
        </li>
      );
    case 'step-changed':
      return (
        <li className="space-y-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
          <div className="text-sm font-medium text-text-primary">Changed: {formatPlaybookStepTitle(entry.stepId)}</div>
          {entry.changes.map((change) => <FieldChange key={change.field} change={change} />)}
        </li>
      );
    case 'reordered':
      return (
        <li className="text-sm text-text-primary">
          Step order: {entry.after.map(formatPlaybookStepTitle).join(', ')}
        </li>
      );
  }
}

/** Approve-or-reject view of a chat-proposed configuration change. */
export function PendingConfigPanel({ change, error, onApprove, onReject, isApplying = false }: PendingConfigPanelProps) {
  const definition = CONFIG_KIND_REGISTRY[change.kind];
  const entries = useMemo(() => describeConfigChange(change), [change]);
  const heading = change.op === 'create'
    ? `New ${definition.label.toLowerCase()}: ${definition.displayName(change.after)}`
    : `Edit ${definition.label.toLowerCase()}: ${definition.displayName(change.before ?? change.after)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="text-sm font-semibold text-text-primary">{heading}</div>
          <div className="mt-0.5 text-xs text-text-muted">{definition.scopeNote}</div>
        </div>
        {error && <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <ol className="space-y-2">
          {entries.map((entry, index) => <Entry key={`${entry.kind}-${'stepId' in entry ? entry.stepId : index}`} entry={entry} />)}
        </ol>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onReject}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded border border-border-subtle text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded bg-accent text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {isApplying ? 'Saving…' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
