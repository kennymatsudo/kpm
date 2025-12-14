import { createPortal } from 'react-dom';

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
  zIndex?: number;
  /** Whether to disable the close behavior (useful during async operations) */
  preventClose?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
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
  preventClose = false,
}: ModalProps) {
  const handleClose = () => {
    if (!preventClose) {
      onClose();
    }
  };

  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isOpen,
    onEscape: closeOnEscape ? handleClose : undefined,
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
          role={role}
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
        >
            ref={containerRef}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`dialog-content ${sizeClasses[size]} mx-4 ${className}`}
          >
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
}

/**
 */
  return (
    <div className={`dialog-header px-5 py-4 flex items-center justify-between border-b ${className}`}>
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

