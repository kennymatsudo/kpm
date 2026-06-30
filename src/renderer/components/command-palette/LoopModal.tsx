import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalHeader, ModalBody } from '../ui/Modal';
import { useScheduledLoopStore, useProjectDomainStore, toast } from '../../stores';

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
    } else {
      setName('');
      setPrompt('');
      setOutputMode('notify');
      setIntervalMinutes(30);
    }

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
        {editingLoop ? 'Edit loop' : 'New loop'}
      </ModalHeader>


          </div>
        </div>
      </ModalBody>

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
