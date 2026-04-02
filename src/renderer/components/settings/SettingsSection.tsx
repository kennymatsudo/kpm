import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusBadge?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  id?: string;
  children: React.ReactNode;
}

export function SettingsSection({
  icon,
  title,
  description,
  statusBadge,
  collapsible = true,
  defaultCollapsed = false,
  id,
  children,
}: SettingsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const handleToggle = () => {
    if (collapsible) {
      setIsCollapsed((prev) => !prev);
    }
  };

  return (
    <div
      id={id}
      className="rounded-xl border border-border-subtle bg-surface-2/30 overflow-hidden"
    >
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={!collapsible}
        className={`
          w-full flex items-center gap-3 px-5 py-4 text-left
          ${collapsible ? 'cursor-pointer hover:bg-surface-2/50 transition-colors' : 'cursor-default'}
        `}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-subtle shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        {statusBadge && <div className="shrink-0">{statusBadge}</div>}
        {collapsible && (
          <svg
            className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ${
              isCollapsed ? '' : 'rotate-180'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle/50 px-5 pb-5 pt-4">
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small status badge for SettingsSection headers */
export function StatusBadge({
  variant,
  children,
}: {
  variant: 'success' | 'warning' | 'muted';
  children: React.ReactNode;
}) {
  const styles = {
    success: 'bg-success-muted text-success',
    warning: 'bg-warning-muted text-warning',
    muted: 'bg-surface-3 text-text-muted',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${styles[variant]}`}>
      {variant === 'success' && (
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
      )}
      {children}
    </span>
  );
}
