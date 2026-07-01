import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalHeader, ModalBody } from '../ui/Modal';
import { useScheduledLoopStore, useProjectDomainStore, toast } from '../../stores';
import { formatRelativeTime } from '../../utils/relativeTime';
import type { LoopOutputMode, LoopRun, LoopRunOutcome } from '../../../shared/types';

const OUTPUT_MODES: { value: LoopOutputMode; label: string; hint: string }[] = [
  { value: 'notify', label: 'Notify', hint: 'Alert me; stays silent when there is nothing to report' },
  { value: 'report', label: 'Report', hint: 'Write or refresh a document under outputs/loops/' },
  { value: 'maintain', label: 'Maintain', hint: 'Automatically update the project’s docs and context' },
];

const INTERVAL_OPTIONS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Once a day' },
];

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-text-primary text-sm focus:outline-none focus:border-border-strong';

const OUTCOME_STYLES: Record<LoopRunOutcome, { label: string; className: string }> = {
  ok: { label: 'Ok', className: 'text-success' },
  no_op: { label: 'Nothing to report', className: 'text-text-tertiary' },
  error: { label: 'Error', className: 'text-danger' },
};

function LoopHistoryRow({ run }: { run: LoopRun }) {
  const outcome = OUTCOME_STYLES[run.outcome];
  return (
    <div className="px-3 py-2 rounded-lg bg-surface-2 border border-border-default">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${outcome.className}`}>{outcome.label}</span>
        <span className="text-xs text-text-tertiary">{formatRelativeTime(run.started_at)}</span>
      </div>
      {run.artifact_path && <p className="text-xs text-text-tertiary mt-1">{run.artifact_path}</p>}
    </div>
  );
}

function OutputPicker({ outputMode, onChange }: { outputMode: LoopOutputMode; onChange: (mode: LoopOutputMode) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Output</label>
      <div className="space-y-2">
        {OUTPUT_MODES.map((m) => {
          const selected = outputMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border border-border-default transition-colors ${
                selected ? 'bg-accent-muted' : 'hover:bg-surface-2'
              }`}
            >
              <div className={`text-sm font-medium ${selected ? 'text-accent' : 'text-text-primary'}`}>{m.label}</div>
              <div className="text-xs text-text-secondary">{m.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Create/edit sheet for a scheduled loop. Driven by useScheduledLoopStore and
 * rendered next to the command palette so it persists after the palette closes.
 */
export function LoopModal() {
  const {
    modalOpen,
    editingLoop,
    closeModal,
    createLoop,
    updateLoop,
    setEnabled,
    deleteLoop,
    runNow,
    history,
    historyLoading,
    loadHistory,
  } = useScheduledLoopStore(
    useShallow((s) => ({
      modalOpen: s.modalOpen,
      editingLoop: s.editingLoop,
      closeModal: s.closeModal,
      createLoop: s.createLoop,
      updateLoop: s.updateLoop,
      setEnabled: s.setEnabled,
      deleteLoop: s.deleteLoop,
      runNow: s.runNow,
      history: s.history,
      historyLoading: s.historyLoading,
      loadHistory: s.loadHistory,
    }))
  );
  const currentProjectId = useProjectDomainStore((s) => s.currentProjectId);

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [outputMode, setOutputMode] = useState<LoopOutputMode>('notify');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    if (editingLoop) {
      setName(editingLoop.name);
      setPrompt(editingLoop.prompt);
      setOutputMode(editingLoop.output_mode);
      setIntervalMinutes(editingLoop.interval_minutes);
      void loadHistory(editingLoop.id);
    } else {
      setName('');
      setPrompt('');
      setOutputMode('notify');
      setIntervalMinutes(30);
    }
  }, [modalOpen, editingLoop, loadHistory]);

  const canSave = name.trim().length > 0 && prompt.trim().length > 0 && !busy;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    let ok = false;
    if (editingLoop) {
      ok = await updateLoop(editingLoop.id, {
        name: name.trim(),
        prompt: prompt.trim(),
        outputMode,
        intervalMinutes,
      });
    } else if (currentProjectId) {
      ok = await createLoop(currentProjectId, {
        name: name.trim(),
        prompt: prompt.trim(),
        outputMode,
        intervalMinutes,
      });
    }
    setBusy(false);
    if (ok) {
      toast.success(editingLoop ? 'Loop updated' : 'Loop created');
      closeModal();
    } else {
      toast.error('Could not save loop');
    }
  };

  const handleRunNow = async () => {
    if (!editingLoop) return;
    setBusy(true);
    await runNow(editingLoop.id);
    setBusy(false);
    toast.success('Loop run complete');
  };

  const handleToggle = async () => {
    if (!editingLoop) return;
    setBusy(true);
    await setEnabled(editingLoop.id, !editingLoop.enabled);
    setBusy(false);
    closeModal();
  };

  const handleDelete = async () => {
    if (!editingLoop) return;
    setBusy(true);
    await deleteLoop(editingLoop.id);
    setBusy(false);
    toast.success('Loop deleted');
    closeModal();
  };

  return (
    <Modal
      isOpen={modalOpen}
      onClose={closeModal}
      size={editingLoop ? 'xl' : 'lg'}
      preventClose={busy}
      className="!flex !flex-col !max-h-[85vh] !overflow-hidden"
    >
      <ModalHeader onClose={closeModal} subtitle="Runs on a schedule while KPM is open" className="shrink-0">
        {editingLoop ? 'Edit loop' : 'New loop'}
      </ModalHeader>
      <ModalBody className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="space-y-4 shrink-0">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PR digest"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Prompt</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Check #eng-alerts for mentions of my services and flag anything urgent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Freeform. Claude uses your connected repos, plan, and MCP tools (Slack, Linear, GitHub) to carry it out.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Run</label>
            <select
              className={inputClass}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {editingLoop ? (
          <div className="mt-4 flex-1 min-h-0 grid grid-cols-2 gap-5">
            <div className="min-h-0 overflow-y-auto pr-1">
              <OutputPicker outputMode={outputMode} onChange={setOutputMode} />
            </div>
            <div className="min-h-0 flex flex-col border-l border-border-default pl-5">
              <label className="block text-xs font-medium text-text-secondary mb-2 shrink-0">History</label>
              {historyLoading ? (
                <p className="text-xs text-text-tertiary">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-text-tertiary">No runs yet.</p>
              ) : (
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                  {history.map((run) => (
                    <LoopHistoryRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 shrink-0">
            <OutputPicker outputMode={outputMode} onChange={setOutputMode} />
          </div>
        )}
      </ModalBody>

      <div className="dialog-footer shrink-0 px-5 py-4 flex items-center justify-between gap-2 border-t">
        <div className="flex items-center gap-2">
          {editingLoop && (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleRunNow} disabled={busy}>
                Run now
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleToggle} disabled={busy}>
                {editingLoop.enabled ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="btn btn-secondary text-danger" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {editingLoop ? 'Save' : 'Create loop'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
