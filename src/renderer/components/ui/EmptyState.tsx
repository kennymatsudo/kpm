import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Icon to display (optional) */
  icon?: ReactNode;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Action button or element */
  action?: ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const defaultIcons = {
  empty: (
    <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  error: (
    <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      container: 'py-4 px-3',
      icon: 'w-8 h-8',
      title: 'text-sm',
      description: 'text-xs',
    },
    md: {
      container: 'py-8 px-4',
      icon: 'w-12 h-12',
      title: 'text-base',
      description: 'text-sm',
    },
    lg: {
      container: 'py-12 px-6',
      icon: 'w-16 h-16',
      title: 'text-lg',
      description: 'text-base',
    },
  };

  const config = sizeConfig[size];

  return (
      {icon !== undefined ? (
        icon && <div className={`${config.icon} text-text-muted mb-3`}>{icon}</div>
      ) : (
        <div className={`${config.icon} text-text-muted mb-3`}>{defaultIcons.empty}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
