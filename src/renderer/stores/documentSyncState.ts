import type { DocumentSyncPreview } from '../../shared/types';

interface SyncRequest {
  projectId: string;
  documentPath: string;
}

interface SyncReceiptRequest extends SyncRequest {
  syncReceipt: string;
}

interface SyncResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DocumentSyncActionResult {
  success: boolean;
  error?: string;
}

export interface DocumentSyncOperations {
  getPreview: (request: SyncRequest) => Promise<SyncResponse<DocumentSyncPreview>>;
  push: (request: SyncReceiptRequest) => Promise<SyncResponse<unknown>>;
  pull: (request: SyncReceiptRequest) => Promise<SyncResponse<unknown>>;
  previewFailureMessage: string;
  pushFailureMessage: string;
  pullFailureMessage: string;
  afterSuccessfulSync?: (projectId: string) => Promise<void>;
}

export interface DocumentSyncState {
  syncPreview: DocumentSyncPreview | null;
  isSyncing: boolean;
  syncError: string | null;
  loadSyncPreview: (projectId: string, documentPath: string) => Promise<void>;
  executePush: (
    projectId: string,
    documentPath: string,
    syncReceipt: string,
  ) => Promise<DocumentSyncActionResult>;
  executePull: (
    projectId: string,
    documentPath: string,
    syncReceipt: string,
  ) => Promise<DocumentSyncActionResult>;
  resetSync: () => void;
}

type SetSyncState = (state: Partial<DocumentSyncState>) => void;

export const initialDocumentSyncState = {
  syncPreview: null,
  isSyncing: false,
  syncError: null,
} satisfies Pick<DocumentSyncState, 'syncPreview' | 'isSyncing' | 'syncError'>;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createDocumentSyncState(
  set: SetSyncState,
  operations: DocumentSyncOperations,
): DocumentSyncState {
  const execute = async (
    request: SyncReceiptRequest,
    action: (request: SyncReceiptRequest) => Promise<SyncResponse<unknown>>,
    fallback: string,
  ): Promise<DocumentSyncActionResult> => {
    set({ isSyncing: true, syncError: null });
    try {
      const result = await action(request);
      if (!result.success) {
        const error = result.error ?? fallback;
        set({ isSyncing: false, syncError: error });
        return { success: false, error };
      }

      await operations.afterSuccessfulSync?.(request.projectId);
      set({ isSyncing: false });
      return { success: true };
    } catch (error) {
      const message = errorMessage(error, fallback);
      set({ isSyncing: false, syncError: message });
      return { success: false, error: message };
    }
  };

  return {
    ...initialDocumentSyncState,

    loadSyncPreview: async (projectId, documentPath) => {
      set({ isSyncing: true, syncError: null, syncPreview: null });
      try {
        const result = await operations.getPreview({ projectId, documentPath });
        if (!result.success || !result.data) {
          set({
            isSyncing: false,
            syncError: result.error ?? operations.previewFailureMessage,
          });
          return;
        }
        set({ isSyncing: false, syncPreview: result.data });
      } catch (error) {
        set({
          isSyncing: false,
          syncError: errorMessage(error, operations.previewFailureMessage),
        });
      }
    },

    executePush: (projectId, documentPath, syncReceipt) =>
      execute(
        { projectId, documentPath, syncReceipt },
        operations.push,
        operations.pushFailureMessage,
      ),

    executePull: (projectId, documentPath, syncReceipt) =>
      execute(
        { projectId, documentPath, syncReceipt },
        operations.pull,
        operations.pullFailureMessage,
      ),

    resetSync: () => set(initialDocumentSyncState),
  };
}
