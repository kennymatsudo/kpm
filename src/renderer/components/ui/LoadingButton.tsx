import { forwardRef, type ReactNode } from 'react';

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
}

  return (
      aria-hidden="true"
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
        ref={ref}
        type={type}
        whileHover={isDisabled ? {} : { scale: 1.02 }}
        whileTap={isDisabled ? {} : { scale: 0.98 }}
        disabled={isDisabled}
        onClick={onClick}
        className={`btn ${variantClasses[variant]} ${sizeClasses[size]} flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
        aria-busy={isLoading}
        aria-label={ariaLabel}
      >
        {isLoading && showSpinner && (
          <LoadingSpinner className={spinnerSizes[size]} />
        )}
        {isLoading && loadingText ? loadingText : children}
    );
  }
);

export { LoadingSpinner };
