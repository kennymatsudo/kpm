import { create } from 'zustand';
import type { PlanAction, ReviewInboxSnapshot } from '../../shared/types';
import type { ApplyPlanActionsResult } from './project/types';
import { usePlanDomainStore } from './projectDomains';
import { useGeneralSettingsStore } from './generalSettingsStore';
import { toast } from './toastStore';
import { emit } from './storeEvents';
import { writeContextFile } from '../services/contextFileService';
import { deleteProjectFile, writeProjectFile } from '../services/workspaceFileService';
import { renameProjectEntry } from '../services/projectFileService';
import { replyToSessionReviewThread } from '../services/reviewService';

export type DisposalPolicy = 'follow_global_mode' | 'review_required';
export type DisposalOutcome =
  | { kind: 'applied' }
  | { kind: 'applied_with_warning'; warning: string }
  | { kind: 'failed'; error: string };

interface ProposedChangeBase {
  id: string;
  projectId: string;
  policy: DisposalPolicy;
  error?: string;
}

export type ProposedChange =
  | (ProposedChangeBase & { type: 'plan-actions'; actions: PlanAction[] })
  | (ProposedChangeBase & { type: 'context-file'; oldContent: string | null; newContent: string })
  | (ProposedChangeBase & { type: 'document'; filePath: string; content: string; oldContent: string | null })
  | (ProposedChangeBase & { type: 'move'; sourcePath: string; targetPath: string })
  | (ProposedChangeBase & { type: 'delete'; filePath: string; isDirectory: boolean })
  | (ProposedChangeBase & {
      type: 'review-reply'; sessionId: string; threadId: string; threadUrl: string;
      threadTitle: string; threadLocation: string; latestCommentPreview: string | null;
      body: string; resolve: boolean;
    });

export type ProposedChangeInput = ProposedChange extends infer Change
  ? Change extends ProposedChange
    ? Omit<Change, 'id' | 'policy' | 'error'>
    : never
  : never;

export type ProposedChangeEdits =
  | { type: 'plan-actions'; actions: PlanAction[] }
  | { type: 'context-file'; newContent: string }
  | { type: 'document'; content: string }
  | { type: 'review-reply'; body: string; resolve: boolean };

interface ProposedChangeAdapter<Change extends ProposedChange = ProposedChange> {
  defaultPolicy: DisposalPolicy;
  identity: (change: Change) => string;
  merge: (current: Change, incoming: Change) => Change;
  applyEdits: (change: Change, edits?: ProposedChangeEdits) => Change;
  execute: (change: Change) => Promise<AdapterOutcome>;
  projectSuccess: (change: Change, outcome: AdapterOutcome) => void | Promise<void>;
  presentation: { label: string; editable: boolean };
}

type AdapterOutcome = DisposalOutcome & { projection?: unknown };

function planApplyOutcome(result: ApplyPlanActionsResult): DisposalOutcome {
  if (result.error) return { kind: 'failed', error: result.error };
  if (result.skipped.length > 0) {
    const summary = result.skipped.map((skip) => `${skip.type}: ${skip.reason}`).join('; ');
    return {
      kind: 'applied_with_warning',
      warning: result.applied > 0
        ? `${result.applied} change(s) applied, ${result.skipped.length} skipped: ${summary}`
        : `No changes applied — ${result.skipped.length} skipped: ${summary}`,
    };
  }
  return result.applied === 0
    ? { kind: 'applied_with_warning', warning: 'No changes were applied' }
    : { kind: 'applied' };
}

async function resultOutcome(operation: () => Promise<{ success: boolean; error?: string }>): Promise<DisposalOutcome> {
  try {
    const result = await operation();
    return result.success ? { kind: 'applied' } : { kind: 'failed', error: result.error ?? 'Operation failed' };
  } catch (error) {
    return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function mergePlanActions(current: Extract<ProposedChange, { type: 'plan-actions' }>, incoming: Extract<ProposedChange, { type: 'plan-actions' }>) {
  const merged = [...current.actions];
  const actionIdentity = (action: PlanAction): string | null => {
    if (!('item_id' in action)) return null;
    if (
      action.type === 'revise_work_brief'
      || action.type === 'set_repo_targets'
      || action.type === 'update_item'
    ) {
      return compoundIdentity(action.type, action.item_id);
    }
    return compoundIdentity('item', action.item_id);
  };
  const existingByIdentity = new Map<string, number>();
  merged.forEach((action, index) => {
    const identity = actionIdentity(action);
    if (identity) existingByIdentity.set(identity, index);
  });

  for (const action of incoming.actions) {
    const identity = actionIdentity(action);
    const existingIndex = identity ? existingByIdentity.get(identity) : undefined;
    if (existingIndex === undefined) {
      if (identity) existingByIdentity.set(identity, merged.length);
      merged.push(action);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = existing.type === 'update_item' && action.type === 'update_item'
      ? { ...existing, updates: { ...existing.updates, ...action.updates } }
      : action;
  }
  return { ...current, actions: merged, error: undefined };
}

const adapters = {
  'plan-actions': {
    defaultPolicy: 'follow_global_mode',
    identity: () => 'plan-actions',
    merge: mergePlanActions,
    applyEdits: (change, edits) => !edits ? change : edits.type === 'plan-actions'
      ? { ...change, actions: edits.actions, error: undefined }
      : invalidEdits(change, edits),
    execute: async (change) => {
      try { return planApplyOutcome(await usePlanDomainStore.getState().executePlanActions(change.actions)); }
      catch (error) { return { kind: 'failed', error: error instanceof Error ? error.message : String(error) }; }
    },
    projectSuccess: () => {},
    presentation: { label: 'Plan Changes', editable: true },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'plan-actions' }>>,
  'context-file': {
    defaultPolicy: 'follow_global_mode',
    identity: () => 'context-file',
    merge: (current, incoming) => ({ ...current, newContent: incoming.newContent, error: undefined }),
    applyEdits: (change, edits) => !edits ? change : edits.type === 'context-file'
      ? { ...change, newContent: edits.newContent, error: undefined }
      : invalidEdits(change, edits),
    execute: (change) => resultOutcome(() => writeContextFile(change.projectId, change.newContent)),
    projectSuccess: () => {},
    presentation: { label: 'Project Context Update', editable: true },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'context-file' }>>,
  document: {
    defaultPolicy: 'follow_global_mode',
    identity: (change) => change.filePath,
    merge: (current, incoming) => ({ ...current, content: incoming.content, error: undefined }),
    applyEdits: (change, edits) => !edits ? change : edits.type === 'document'
      ? { ...change, content: edits.content, error: undefined }
      : invalidEdits(change, edits),
    execute: (change) => resultOutcome(() => writeProjectFile(change.projectId, change.filePath, change.content)),
    projectSuccess: (change) => emit({ type: 'file-explorer-changed', payload: { projectId: change.projectId, type: 'updated', path: change.filePath, isDirectory: false } }),
    presentation: { label: 'Document Update', editable: true },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'document' }>>,
  move: {
    defaultPolicy: 'follow_global_mode',
    identity: (change) => compoundIdentity(change.sourcePath, change.targetPath),
    merge: (current) => current,
    applyEdits: (change, edits) => edits ? invalidEdits(change, edits) : change,
    execute: (change) => resultOutcome(async () => {
      await renameProjectEntry({ projectId: change.projectId, oldPath: change.sourcePath, newPath: change.targetPath });
      return { success: true };
    }),
    projectSuccess: (change) => emit({ type: 'file-explorer-changed', payload: { projectId: change.projectId, type: 'renamed', path: change.sourcePath, newPath: change.targetPath, isDirectory: false } }),
    presentation: { label: 'Confirm Move', editable: false },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'move' }>>,
  delete: {
    defaultPolicy: 'follow_global_mode',
    identity: (change) => change.filePath,
    merge: (current) => current,
    applyEdits: (change, edits) => edits ? invalidEdits(change, edits) : change,
    execute: (change) => resultOutcome(() => deleteProjectFile(change.projectId, change.filePath)),
    projectSuccess: (change) => emit({ type: 'file-explorer-changed', payload: { projectId: change.projectId, type: 'deleted', path: change.filePath, isDirectory: change.isDirectory } }),
    presentation: { label: 'Confirm Deletion', editable: false },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'delete' }>>,
  'review-reply': {
    defaultPolicy: 'review_required',
    identity: (change) => compoundIdentity(change.sessionId, change.threadId),
    merge: (current, incoming) => ({ ...current, ...incoming, id: current.id, error: undefined }),
    applyEdits: (change, edits) => !edits ? change : edits.type === 'review-reply'
      ? { ...change, body: edits.body, resolve: edits.resolve, error: undefined }
      : invalidEdits(change, edits),
    execute: async (change) => {
      try {
        const result = await replyToSessionReviewThread({
          sessionId: change.sessionId, threadId: change.threadId, body: change.body, resolve: change.resolve,
        });
        if (!result.success) return { kind: 'failed', error: result.error ?? 'Failed to post review reply' };
        return { kind: 'applied', projection: result.inbox ?? null };
      } catch (error) { return { kind: 'failed', error: error instanceof Error ? error.message : String(error) }; }
    },
    projectSuccess: (change, outcome) => emit({
      type: 'review-reply-applied',
      payload: { sessionId: change.sessionId, inbox: outcome.projection as ReviewInboxSnapshot | null },
    }),
    presentation: { label: 'Review Reply', editable: true },
  } satisfies ProposedChangeAdapter<Extract<ProposedChange, { type: 'review-reply' }>>,
} satisfies { [Kind in ProposedChange['type']]: ProposedChangeAdapter<Extract<ProposedChange, { type: Kind }>> };

function adapterFor(change: ProposedChange): ProposedChangeAdapter {
  return adapters[change.type] as ProposedChangeAdapter;
}

function compoundIdentity(...parts: string[]): string {
  return JSON.stringify(parts);
}

function invalidEdits(change: ProposedChange, edits: ProposedChangeEdits): never {
  throw new Error(`Edits for ${edits.type} cannot be applied to ${change.type}`);
}

let idCounter = 0;
const nextId = () => `proposed-change-${Date.now()}-${++idCounter}`;
interface QueuedAttempt { change: ProposedChange; generation: number }
const autoQueue: QueuedAttempt[] = [];
let executionTail: Promise<void> = Promise.resolve();
let projectGeneration = 0;

interface ProposedChangeDisposalState {
  pending: ProposedChange[];
  activeAttempt: ProposedChange | null;
  userMinimized: boolean;
  panelWidth: number;
  propose: (input: ProposedChangeInput, options?: { policy?: DisposalPolicy }) => void;
  approve: (id: string, edits?: ProposedChangeEdits) => Promise<DisposalOutcome>;
  retry: (id: string) => Promise<DisposalOutcome>;
  dismiss: (id: string) => void;
  resetProject: () => void;
  resetProjectState: () => void;
  setUserMinimized: (minimized: boolean) => void;
  setPanelWidth: (width: number) => void;
}

export const useProposedChangeDisposal = create<ProposedChangeDisposalState>((set, get) => {
  type AttemptOutcome = DisposalOutcome | { kind: 'stale' };
  const executeSerialized = (snapshot: ProposedChange, generation: number): Promise<AttemptOutcome> => {
    let resolveOutcome!: (outcome: AttemptOutcome) => void;
    const result = new Promise<AttemptOutcome>((resolve) => { resolveOutcome = resolve; });
    executionTail = executionTail.then(async () => {
      if (generation !== projectGeneration) { resolveOutcome({ kind: 'stale' }); return; }
      set({ activeAttempt: snapshot });
      const adapter = adapterFor(snapshot);
      let outcome: DisposalOutcome;
      try {
        outcome = await adapter.execute(snapshot);
      } catch (error) {
        outcome = { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
      }
      if (generation !== projectGeneration) { resolveOutcome({ kind: 'stale' }); return; }
      if (outcome.kind !== 'failed') {
        try { await adapter.projectSuccess(snapshot, outcome); }
        catch (error) { console.warn('[ProposedChangeDisposal] Success projection failed', error); }
      }
      set({ activeAttempt: null });
      resolveOutcome(outcome);
    }).catch((error) => {
      set({ activeAttempt: null });
      resolveOutcome({ kind: 'failed', error: error instanceof Error ? error.message : String(error) });
    });
    return result;
  };

  const drainAutoQueue = (): void => {
    const queued = autoQueue.shift();
    if (!queued) return;
    const { change: next, generation } = queued;
    void executeSerialized({ ...next }, generation).then((outcome) => {
      if (outcome.kind === 'stale') { drainAutoQueue(); return; }
      if (outcome.kind === 'failed') {
        set((state) => ({
          pending: [...state.pending, { ...next, policy: 'review_required', error: outcome.error }],
          userMinimized: false,
        }));
        toast.error(`Could not apply ${adapterFor(next).presentation.label.toLowerCase()}: ${outcome.error}`);
      } else if (outcome.kind === 'applied_with_warning') {
        toast.warning(outcome.warning);
      } else {
        toast.success(`${adapterFor(next).presentation.label} applied`);
      }
      drainAutoQueue();
    });
  };

  return {
    pending: [], activeAttempt: null, userMinimized: false, panelWidth: 560,
    propose: (input, options) => {
      if (input.type === 'plan-actions' && input.actions.length === 0) return;
      const draft = { ...input, id: nextId(), policy: 'follow_global_mode' } as ProposedChange;
      const defaultPolicy = adapterFor(draft).defaultPolicy;
      const policy: DisposalPolicy = defaultPolicy === 'review_required' || options?.policy === 'review_required'
        ? 'review_required'
        : 'follow_global_mode';
      const change = { ...draft, policy };
      const review = policy === 'review_required' || useGeneralSettingsStore.getState().approvalMode !== 'auto_apply';
      const target = review ? get().pending : autoQueue.map((entry) => entry.change);
      const adapter = adapterFor(change);
      const identity = adapter.identity(change);
      const existingIndex = target.findIndex((candidate) => candidate.type === change.type && adapterFor(candidate).identity(candidate) === identity);
      if (existingIndex >= 0) {
        const merged = adapter.merge(target[existingIndex], change);
        if (review) set((state) => ({ pending: state.pending.map((item, index) => index === existingIndex ? merged : item) }));
        else autoQueue[existingIndex] = { change: merged, generation: projectGeneration };
        return;
      }
      if (review) set((state) => ({ pending: [...state.pending, change], userMinimized: false }));
      else { autoQueue.push({ change, generation: projectGeneration }); drainAutoQueue(); }
    },
    approve: async (id, edits) => {
      const current = get().pending.find((change) => change.id === id);
      if (!current) return { kind: 'failed', error: 'Proposed Change not found' };
      const edited = adapterFor(current).applyEdits(current, edits);
      // Freeze this attempt and remove it from the merge target. A matching
      // proposal arriving while execution is in flight becomes a successor.
      set((state) => ({ pending: state.pending.filter((change) => change.id !== id) }));
      const generation = projectGeneration;
      const outcome = await executeSerialized({ ...edited }, generation);
      if (outcome.kind === 'stale') return { kind: 'failed', error: 'Project changed before disposal completed' };
      if (outcome.kind === 'failed') {
        set((state) => ({ pending: [{ ...edited, error: outcome.error }, ...state.pending] }));
      }
      return outcome;
    },
    retry: (id) => get().approve(id),
    dismiss: (id) => set((state) => ({ pending: state.pending.filter((change) => change.id !== id) })),
    resetProject: () => { projectGeneration += 1; autoQueue.length = 0; set({ pending: [], activeAttempt: null, userMinimized: false }); },
    resetProjectState: () => get().resetProject(),
    setUserMinimized: (userMinimized) => set({ userMinimized }),
    setPanelWidth: (panelWidth) => set({ panelWidth }),
  };
});

export function getProposedChangePresentation(change: ProposedChange) {
  return adapterFor(change).presentation;
}

export { planApplyOutcome };
