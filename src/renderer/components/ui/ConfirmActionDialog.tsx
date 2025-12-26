import { Modal } from './Modal';
import { MotionButton, ActionButton } from './MotionButton';

interface ActionOption {
  /** Primary label for the action */
  label: string;
  /** Secondary description text */
  description?: string;
  /** Text to show while action is processing */
  loadingText?: string;
  /** Button style variant */
  variant: 'primary' | 'danger' | 'secondary';
  /** Click handler - can be async */
  onClick: () => void | Promise<void>;
  /** Aria label for accessibility */
  ariaLabel?: string;
}

interface ConfirmActionDialogProps {
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  message: ReactNode;
  /** Cancel button label */
  cancelLabel?: string;
  /** Called when cancel is clicked or dialog is closed */
  onCancel: () => void;
  /**
   * Single action mode - one primary action button
   * Use when there's only one choice to make
   */
  action?: ActionOption;
  /**
   * Dual action mode - two choices for the user
   * Use when user needs to choose between two options
   */
  dualActions?: [ActionOption, ActionOption];
  /** Unique ID prefix for accessibility */
  dialogId?: string;
}

const variantClasses: Record<ActionOption['variant'], string> = {
  primary:
    'bg-[color:var(--color-accent)] text-white rounded-lg hover:bg-[color:var(--color-accent-hover)] transition-colors',
  danger: 'bg-danger text-white rounded-lg hover:opacity-90 transition-opacity',
  secondary:
    'bg-surface-3 text-text-primary rounded-lg hover:bg-surface-hover transition-colors',
};

/**
 * Generic confirmation dialog with flexible action configurations.
 *
 * Supports two modes:
 * 1. Single action: One primary button + cancel (use `action` prop)
 * 2. Dual action: Two choice buttons + cancel (use `dualActions` prop)
 *
 * Handles loading states automatically when onClick returns a Promise.
 */
export function ConfirmActionDialog({
  title,
  message,
  cancelLabel = 'Cancel',
  onCancel,
  action,
  dualActions,
  dialogId = 'confirm-dialog',
}: ConfirmActionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<0 | 1 | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const handleAction = async (
    actionConfig: ActionOption,
    actionIndex: 0 | 1 | null
  ) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setActiveAction(actionIndex);
    try {
      await actionConfig.onClick();
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  const renderActionButton = (
    actionConfig: ActionOption,
  ) => {
    const isThisLoading = isProcessing && activeAction === index;

    return (
      <ActionButton
        key={index ?? 'single'}
        label={actionConfig.label}
        description={actionConfig.description}
        isLoading={isThisLoading}
        loadingText={actionConfig.loadingText}
        disabled={isProcessing}
        onClick={() => handleAction(actionConfig, index)}
        className={variantClasses[actionConfig.variant]}
        aria-label={actionConfig.ariaLabel}
      />
    );
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      preventClose={isProcessing}
      role="alertdialog"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
    >
      <div className="p-5">
        <h3
          id={`${dialogId}-title`}
          className="text-base font-medium text-text-primary mb-2"
        >
          {title}
        </h3>
        <div
          id={`${dialogId}-description`}
          className="text-sm text-text-secondary mb-5"
        >
          {message}
        </div>
          {dualActions && (
            <>
            </>
          )}
          <MotionButton
            ref={cancelButtonRef}
            variant="secondary"
            disabled={isProcessing}
            onClick={onCancel}
            aria-label={`${cancelLabel} and keep items`}
          >
            {cancelLabel}
          </MotionButton>
        </div>
      </div>
    </Modal>
  );
}
