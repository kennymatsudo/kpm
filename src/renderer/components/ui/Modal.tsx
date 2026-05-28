import type { ReactNode, RefObject } from 'react';
import { CloseIcon } from '../icons';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Z_INDEX } from '../../constants/zIndex';
import { ModalLayerProvider } from './ModalLayerContext';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';

interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close (backdrop click, escape key) */
  onClose: () => void;
  /** Modal content */
  children: ReactNode;
  /** Size preset for the modal */
  size?: ModalSize;
  /** Custom className for the modal content container */
  className?: string;
  /** Whether clicking the backdrop closes the modal (default: true) */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean;
  /** Ref to element that should receive initial focus */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** ARIA role for the modal (default: 'dialog') */
  role?: 'dialog' | 'alertdialog';
  /** ARIA labelledby ID */
  'aria-labelledby'?: string;
  /** ARIA describedby ID */
  'aria-describedby'?: string;
  /** Z-index for the modal (default: Z_INDEX.modal) */
  zIndex?: number;
  /** Whether to disable the close behavior (useful during async operations) */
  preventClose?: boolean;
  /** Called when the modal open animation completes */
  onAnimationComplete?: () => void;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'w-full max-w-lg max-h-[420px]',       // 512px wide, ~420px max height
  md: 'w-full max-w-2xl max-h-[560px]',      // 672px wide, ~560px max height
  lg: 'w-full max-w-3xl max-h-[640px]',      // 768px wide, ~640px max height
  xl: 'w-full max-w-4xl max-h-[720px]',      // 896px wide, ~720px max height
  '2xl': 'w-full max-w-5xl max-h-[800px]',   // 1024px wide, ~800px max height
  '3xl': 'w-full max-w-6xl max-h-[880px]',   // 1152px wide, ~880px max height
  '4xl': 'w-full max-w-7xl max-h-[960px]',   // 1280px wide, ~960px max height
  full: 'w-full max-w-[90vw] max-h-[85vh]',
};

/**
 * Base Modal component with Portal, animations, focus trap, and consistent styling.
 *
 * @example
 * // Simple usage
 * <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
 *   <div className="p-5">Content here</div>
 * </Modal>
 *
 * @example
 * // With header and footer
 * <Modal isOpen={isOpen} onClose={handleClose} size="md">
 *   <ModalHeader onClose={handleClose}>Title</ModalHeader>
 *   <ModalBody>Content</ModalBody>
 *   <ModalFooter>
 *     <button onClick={handleClose}>Cancel</button>
 *   </ModalFooter>
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  className = '',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialFocusRef,
  role = 'dialog',
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  zIndex = Z_INDEX.modal,
  preventClose = false,
  onAnimationComplete,
}: ModalProps) {
  const handleClose = () => {
    if (!preventClose) {
      onClose();
    }
  };

  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isOpen,
    onEscape: closeOnEscape ? handleClose : undefined,
    // When no explicit target is given, let the focus trap fall back to the
    // first focusable element rather than a non-interactive placeholder.
    initialFocusRef,
    restoreFocus: true,
  });

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      handleClose();
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex,
          }}
          onClick={handleBackdropClick}
          role={role}
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
        >
          <m.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            onAnimationComplete={onAnimationComplete}
            className={`dialog-content ${sizeClasses[size]} mx-4 ${className}`}
          >
            <ModalLayerProvider zIndex={zIndex}>{children}</ModalLayerProvider>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ============================================
   Modal Subcomponents
   ============================================ */

interface ModalHeaderProps {
  children: ReactNode;
  /** Close button handler - if not provided, no close button is rendered */
  onClose?: () => void;
  /** Additional className */
  className?: string;
  /** ID for aria-labelledby */
  id?: string;
  /** Optional icon rendered before the title */
  icon?: ReactNode;
  /** Optional subtitle rendered below the title */
  subtitle?: ReactNode;
}

/**
 * Modal header with optional icon, subtitle, and close button.
 */
export function ModalHeader({ children, onClose, className = '', id, icon, subtitle }: ModalHeaderProps) {
  return (
    <div className={`dialog-header px-5 py-4 flex items-center justify-between border-b ${className}`}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h2 id={id} className="text-lg font-semibold text-text-primary">
            {children}
          </h2>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-3 transition-colors"
          aria-label="Close dialog"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

interface ModalBodyProps {
  children: ReactNode;
  /** Additional className */
  className?: string;
  /** ID for aria-describedby */
  id?: string;
}

/**
 * Modal body for main content.
 */
export function ModalBody({ children, className = '', id }: ModalBodyProps) {
  return (
    <div id={id} className={`p-5 ${className}`}>
      {children}
    </div>
  );
}

interface ModalFooterProps {
  children: ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * Modal footer for actions.
 */
export function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div className={`dialog-footer px-5 py-4 flex items-center justify-end gap-2 border-t ${className}`}>
      {children}
    </div>
  );
}

