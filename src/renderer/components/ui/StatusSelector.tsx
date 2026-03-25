import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import type { StatusCategory } from '../../../shared/types';

interface StatusSelectorProps {
  value: StatusCategory | null;
  onChange: (status: StatusCategory) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const STATUS_OPTIONS: StatusCategory[] = [
  'not_started',
  'in_progress',
  'in_review',
  'done',
];

export function StatusSelector({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: StatusSelectorProps) {
  const currentConfig = value ? STATUS_CATEGORY_CONFIG[value] : null;
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xxs' : 'px-2 py-1 text-xs';

  return (
        aria-label={`Status: ${currentConfig?.label ?? 'Not set'}`}
        className={`
          inline-flex items-center gap-1 font-medium rounded transition-all duration-150
          ${sizeClasses}
          ${currentConfig
            ? `${currentConfig.bgClass} ${currentConfig.textClass}`
            : 'bg-surface-3 text-text-muted'
          }
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:brightness-110 cursor-pointer'
          }
        `}
      >
        <span>{currentConfig?.label ?? 'Set status'}</span>
        {!disabled && (
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
  );
}
