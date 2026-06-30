import { create } from 'zustand';
import {
  listScheduledLoops,
  createScheduledLoop,
  updateScheduledLoop,
  setScheduledLoopEnabled,
  deleteScheduledLoop,
  runScheduledLoopNow,
} from '../services/scheduledLoopService';

export interface LoopFormInput {
  name: string;
  prompt: string;
  outputMode: LoopOutputMode;
  intervalMinutes: number;
}

interface ScheduledLoopState {
  loops: ScheduledLoop[];
  isLoading: boolean;
  error: string | null;

  // Create/edit modal state (the modal lives next to the command palette).
  modalOpen: boolean;
  editingLoop: ScheduledLoop | null;

  loadLoops: (projectId: string) => Promise<void>;
  openCreate: () => void;
  openEdit: (loop: ScheduledLoop) => void;
  closeModal: () => void;
  createLoop: (projectId: string, input: LoopFormInput) => Promise<boolean>;
  updateLoop: (id: string, input: Partial<LoopFormInput>) => Promise<boolean>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  deleteLoop: (id: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
}

export const useScheduledLoopStore = create<ScheduledLoopState>((set, get) => ({
  loops: [],
  isLoading: false,
  error: null,
  modalOpen: false,
  editingLoop: null,

  loadLoops: async (projectId) => {
    set({ isLoading: true, error: null });
    const res = await listScheduledLoops(projectId);
    if (res.success) {
      set({ loops: res.data ?? [], isLoading: false });
    } else {
      set({ error: res.error ?? 'Failed to load loops', isLoading: false });
    }
  },


  createLoop: async (projectId, input) => {
    const res = await createScheduledLoop({ projectId, ...input });
    if (res.success) {
      await get().loadLoops(projectId);
      return true;
    }
    set({ error: res.error ?? 'Failed to create loop' });
    return false;
  },

  updateLoop: async (id, input) => {
    const res = await updateScheduledLoop(id, input);
    if (res.success) {
      const projectId = res.data?.project_id ?? get().editingLoop?.project_id;
      if (projectId) await get().loadLoops(projectId);
      return true;
    }
    set({ error: res.error ?? 'Failed to update loop' });
    return false;
  },

  setEnabled: async (id, enabled) => {
    const res = await setScheduledLoopEnabled(id, enabled);
    if (res.success && res.data) await get().loadLoops(res.data.project_id);
  },

  deleteLoop: async (id) => {
    const loop = get().loops.find((l) => l.id === id) ?? get().editingLoop;
    await deleteScheduledLoop(id);
    if (loop) await get().loadLoops(loop.project_id);
  },

  runNow: async (id) => {
    await runScheduledLoopNow(id);
  },
}));
