import { forwardRef, type ReactNode } from 'react';
import { m } from 'framer-motion';

interface LoadingButtonProps {
  /** Whether the button is in a loading state */
  isLoading?: boolean;
  /** Text to show when loading (defaults to adding "..." to children) */
  loadingText?: string;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show the spinner */
  showSpinner?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  /** Native tooltip — useful for explaining why a disabled button is disabled */
  title?: string;
}

type SpinnerColor = 'current' | 'accent' | 'info' | 'white';

interface LoadingSpinnerProps {
  className?: string;
  /** Color variant - 'current' uses SVG spinner that inherits text color, others use CSS border spinner */
  color?: SpinnerColor;
}

/**
 * Loading spinner component with color variants.
 * - 'current': SVG spinner that inherits text color (default)
 * - 'accent': Purple accent color CSS spinner
 * - 'info': Blue info color CSS spinner
 * - 'white': White CSS spinner (for dark backgrounds)
 */
function LoadingSpinner({ className = '', color = 'current' }: LoadingSpinnerProps) {
  // For 'current', use existing SVG spinner that inherits text color
  if (color === 'current') {
    return (
      <svg
        className={`animate-spin ${className}`}
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

  // For colored variants, use CSS border spinner
  const colorClasses: Record<Exclude<SpinnerColor, 'current'>, string> = {
    accent: 'border-accent/30 border-t-accent',
    info: 'border-info/30 border-t-info',
    white: 'border-white/30 border-t-white',
  };

  return (
    <div
      className={`border-2 ${colorClasses[color]} rounded-full animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton(
    {
      isLoading = false,
      loadingText,
      variant = 'primary',
      size = 'md',
      showSpinner = true,
      children,
      className = '',
      disabled,
      onClick,
      type = 'button',
      'aria-label': ariaLabel,
      title,
    },
    ref
  ) {
    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs',
      md: '', // Default btn padding
      lg: 'px-6 py-3 text-base',
    };

    const spinnerSizes = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    };

    const isDisabled = disabled || isLoading;

    return (
      <m.button
        ref={ref}
        type={type}
        whileHover={isDisabled ? {} : { scale: 1.02 }}
        whileTap={isDisabled ? {} : { scale: 0.98 }}
        disabled={isDisabled}
        onClick={onClick}
        className={`btn ${variantClasses[variant]} ${sizeClasses[size]} flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
        aria-busy={isLoading}
        aria-label={ariaLabel}
        title={title}
      >
        {isLoading && showSpinner && (
          <LoadingSpinner className={spinnerSizes[size]} />
        )}
        {isLoading && loadingText ? loadingText : children}
      </m.button>
    );
  }
);

export { LoadingSpinner };
