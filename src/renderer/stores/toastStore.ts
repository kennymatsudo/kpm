import { create } from 'zustand';
import { getBaseName } from '../utils/path';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'file';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Duration in ms before auto-dismiss. Default: 4000. Set to 0 to disable auto-dismiss. */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  /** Add a toast notification */
  addToast: (toast: Omit<Toast, 'id'>) => string;
  /** Remove a toast by id */
  removeToast: (id: string) => void;
  /** Clear all toasts */
  clearAll: () => void;
}

let toastIdCounter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastIdCounter}`;
    const duration = toast.duration ?? 4000;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, duration }],
    }));

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

/** Extract filename from a path */
function getFileName(path: string): string {
  return getBaseName(path, path);
}

// Convenience functions for common toast types
export const toast = {
  success: (message: string, action?: Toast['action']) =>
    useToastStore.getState().addToast({ type: 'success', message, action }),
  error: (message: string, action?: Toast['action']) =>
    useToastStore.getState().addToast({
      type: 'error',
      message,
      // Default to a Copy action so the user can preserve the error text before
      // the toast auto-dismisses. Longer duration gives time to read it.
      action: action ?? {
        label: 'Copy',
        onClick: () => void navigator.clipboard?.writeText(message),
      },
      duration: 8000,
    }),
  info: (message: string, action?: Toast['action']) =>
    useToastStore.getState().addToast({ type: 'info', message, action }),
  warning: (message: string, action?: Toast['action']) =>
    useToastStore.getState().addToast({ type: 'warning', message, action }),
  /** Show a file change toast with optional action */
  file: (path: string, changeType: 'created' | 'modified', onClick?: () => void) =>
    useToastStore.getState().addToast({
      type: 'file',
      message: `${getFileName(path)} ${changeType}`,
      action: onClick ? { label: 'Open', onClick } : undefined,
      duration: 5000,
    }),
};
