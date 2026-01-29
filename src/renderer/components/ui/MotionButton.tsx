import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { m, type MotionProps } from 'framer-motion';

type ScalePreset = 'default' | 'subtle' | 'none';

interface MotionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MotionProps> {
  /** Scale preset for hover/tap animations */
  scalePreset?: ScalePreset;
  /** Button variant - applies btn-* classes */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'none';
  /** Additional className */
  className?: string;
  children: ReactNode;
}

const scaleConfigs: Record<ScalePreset, { hover: number; tap: number }> = {
  default: { hover: 1.02, tap: 0.98 },
  subtle: { hover: 1.01, tap: 0.99 },
  none: { hover: 1, tap: 1 },
};

const variantClasses: Record<NonNullable<MotionButtonProps['variant']>, string> =
  {
    primary: 'btn btn-primary',
    secondary: 'btn btn-secondary',
    ghost: 'btn btn-ghost',
    danger: 'btn btn-danger',
    none: '',
  };

/**
 * Base motion button with scale animations.
 * Use this for simple buttons that need motion animations.
 * For buttons with loading states, use LoadingButton instead.
 */
export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionButton(
    {
      scalePreset = 'default',
      variant = 'none',
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) {
    const scale = scaleConfigs[scalePreset];
    const shouldAnimate = !disabled && scalePreset !== 'none';

    return (
      <m.button
        ref={ref}
        whileHover={shouldAnimate ? { scale: scale.hover } : {}}
        whileTap={shouldAnimate ? { scale: scale.tap } : {}}
        disabled={disabled}
        className={`${variantClasses[variant]} ${className}`.trim()}
        {...props}
      >
        {children}
      </m.button>
    );
  }
);

interface ActionButtonProps extends Omit<MotionButtonProps, 'children'> {
  /** Primary text/label */
  label: ReactNode;
  /** Secondary description text */
  description?: ReactNode;
  /** Show loading spinner and text */
  isLoading?: boolean;
  /** Text to show when loading */
  loadingText?: string;
  /** Optional additional content below description */
  children?: ReactNode;
}

/**
 * Action button with optional description line.
 * Used in confirmation dialogs for dual-action choices.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    {
      label,
      description,
      isLoading,
      loadingText,
      scalePreset = 'subtle',
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || isLoading;

    return (
      <MotionButton
        ref={ref}
        scalePreset={scalePreset}
        disabled={isDisabled}
        aria-busy={isLoading}
        {...props}
      >
        <div className={`font-medium flex items-center gap-2 ${description ? '' : 'justify-center'}`}>
          {isLoading && <LoadingSpinnerSmall />}
          {isLoading && loadingText ? loadingText : label}
        </div>
        {description && (
          <div className="text-xs opacity-80 mt-0.5">{description}</div>
        )}
        {children}
      </MotionButton>
    );
  }
);

function LoadingSpinnerSmall() {
  return (
    <svg
      className="animate-spin w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
