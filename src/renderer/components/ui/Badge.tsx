import type { ReactNode } from 'react';

/**
 * Badge component for displaying status indicators, labels, and counts.
 *
 * @example Basic usage
 * ```tsx
 * <Badge variant="info">PROJ-123</Badge>
 * <Badge variant="success" dot>Active</Badge>
 * <Badge variant="default" pill>3</Badge>
 * ```
 *
 * @example With icon
 * ```tsx
 * <Badge variant="info" icon={<JiraIcon />}>PROJ-123</Badge>
 * ```
 *
 * @example With pulsing dot
 * ```tsx
 * <Badge variant="success" dot dotPulse>Running</Badge>
 * ```
 */

export type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  /** Badge content */
  children: ReactNode;
  /** Color variant */
  variant?: BadgeVariant;
  /** Size variant */
  size?: BadgeSize;
  /** Icon to display before the label */
  icon?: ReactNode;
  /** Show a dot indicator before the label */
  dot?: boolean;
  /** Animate the dot with a pulse effect */
  dotPulse?: boolean;
  /** Use pill (rounded-full) style instead of rounded corners */
  pill?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Title attribute for hover tooltip */
  title?: string;
  /** Click handler (makes badge interactive) */
  onClick?: () => void;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  default: {
    bg: 'bg-surface-3',
    text: 'text-text-muted',
    dot: 'bg-text-muted',
  },
  info: {
    bg: 'bg-info-muted',
    text: 'text-info',
    dot: 'bg-info',
  },
  success: {
    bg: 'bg-success-muted',
    text: 'text-success',
    dot: 'bg-success',
  },
  warning: {
    bg: 'bg-warning-muted',
    text: 'text-warning',
    dot: 'bg-warning',
  },
  danger: {
    bg: 'bg-danger-muted',
    text: 'text-danger',
    dot: 'bg-danger',
  },
  accent: {
    bg: 'bg-accent-muted',
    text: 'text-accent',
    dot: 'bg-accent',
  },
};

const sizeStyles: Record<BadgeSize, { padding: string; text: string; gap: string; dot: string }> = {
  sm: {
    padding: 'px-1.5 py-0.5',
    gap: 'gap-1',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    padding: 'px-2 py-1',
    text: 'text-xs',
    gap: 'gap-1.5',
    dot: 'w-2 h-2',
  },
};

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  icon,
  dot,
  dotPulse,
  pill,
  className = '',
  title,
  onClick,
}: BadgeProps) {
  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];

  const baseClasses = `
    inline-flex items-center ${sizes.gap} ${sizes.padding} ${sizes.text}
    font-medium ${pill ? 'rounded-full' : 'rounded'}
    ${styles.bg} ${styles.text}
    ${onClick ? 'cursor-pointer hover:brightness-110 transition-colors' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const content = (
    <>
      {dot && (
        <span className="relative flex items-center justify-center">
          {dotPulse && (
            <span
              className={`absolute inline-flex ${sizes.dot} rounded-full ${styles.dot} opacity-75 animate-ping`}
            />
          )}
          <span className={`relative inline-flex ${sizes.dot} rounded-full ${styles.dot}`} />
        </span>
      )}
      {icon && <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={baseClasses} title={title} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <span className={baseClasses} title={title}>
      {content}
    </span>
  );
}
