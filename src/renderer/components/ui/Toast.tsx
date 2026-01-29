import { memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useToastStore, type Toast as ToastType, type ToastType as ToastVariant } from '../../stores/toastStore';

const iconsByType: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    </svg>
  ),
  info: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    </svg>
  ),
  file: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

// Subtle icon backgrounds - translucent with semantic colors
const iconBgByType: Record<ToastVariant, string> = {
  success: 'bg-success/20 text-success',
  error: 'bg-danger/20 text-danger',
  warning: 'bg-warning/20 text-warning',
  info: 'bg-accent/20 text-accent',
  file: 'bg-info/20 text-info',
};

// Subtle text colors matching the theme
const textByType: Record<ToastVariant, string> = {
  success: 'text-text-primary',
  error: 'text-text-primary',
  warning: 'text-text-primary',
  info: 'text-text-primary',
  file: 'text-text-primary',
};

// Subtle left accent border
const accentByType: Record<ToastVariant, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-accent',
  file: 'border-l-info',
};

interface ToastItemProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const ToastItem = memo(function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const handleDismiss = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  return (
    <m.div
      layout
      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      className={`
        bg-surface-elevated backdrop-blur-md
        rounded-lg border border-border-subtle
        border-l-[3px] ${accentByType[toast.type]}
        shadow-md
      `}
      role="alert"
      aria-live="polite"
    >
      {/* Icon - small and subtle */}
      <div className={`flex-shrink-0 p-1 rounded-md ${iconBgByType[toast.type]}`}>
        {iconsByType[toast.type]}
      </div>

      {/* Message */}
        {toast.message}
      </p>

      {/* Action button */}
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            handleDismiss();
          }}
          className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded-md bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-colors"
        >
          {toast.action.label}
        </button>
      )}

      {/* Dismiss button - very subtle */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </m.div>
  );
});

/**
 * Toast container - renders all active toasts in a portal.
 * Place this component once at the app root (e.g., in Layout.tsx).
 *
 * - Translucent background with backdrop blur
 * - Soft left accent border for type indication
 */
export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return createPortal(
    <div
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
            <ToastItem toast={toast} onDismiss={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

export { ToastItem };
