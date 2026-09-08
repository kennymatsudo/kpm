import type { ReactNode } from 'react';
import { AlertCircleIcon } from '../icons';

export type InlineAlertVariant = 'error' | 'warning';

interface InlineAlertProps {
  variant: InlineAlertVariant;
  /** Bold lead-in line. Omit for a single-line alert with no title. */
  title?: string;
  children: ReactNode;
  /** Tighter padding/icon size for dense contexts like an inline form field. */
  compact?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<InlineAlertVariant, { container: string; accent: string }> = {
  error: { container: 'bg-red-500/10 border-red-500/20', accent: 'text-red-400' },
  warning: { container: 'bg-amber-500/10 border-amber-500/20', accent: 'text-amber-400' },
};

/** A dismissal-free inline error/warning box for modal and form bodies. */
export function InlineAlert({ variant, title, children, compact = false, className = '' }: InlineAlertProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-start ${compact ? 'gap-2 p-2.5' : 'gap-3 p-3'} rounded-md border ${styles.container} ${className}`}
    >
      <AlertCircleIcon className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${styles.accent} flex-shrink-0 mt-0.5`} />
      {title ? (
        <div>
          <p className={`text-xs font-medium ${styles.accent}`}>{title}</p>
          <p className="text-xs text-text-muted mt-1">{children}</p>
        </div>
      ) : (
        <p className={`text-xs ${styles.accent}`}>{children}</p>
      )}
    </div>
  );
}
