import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import type { StatusCategory } from '../../../shared/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
} from './Select';

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
    <Select
      value={value ?? undefined}
      onValueChange={(next) => onChange(next as StatusCategory)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={`Status: ${currentConfig?.label ?? 'Not set'}`}
        title={disabled ? 'Status editing disabled' : 'Click to change status'}
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
          data-[state=open]:[&>svg]:rotate-180
        `}
      >
        <span>{currentConfig?.label ?? 'Set status'}</span>
        {!disabled && (
          <svg
            className="w-3 h-3 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </SelectTrigger>
      <SelectContent sideOffset={4} style={{ minWidth: 140 }}>
        {STATUS_OPTIONS.map((status) => {
          const config = STATUS_CATEGORY_CONFIG[status];
          const isSelected = status === value;
          return (
            <SelectItem key={status} value={status}>
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${config.bgClass} border border-border-default`}
                />
              </span>
              <span className="flex items-center gap-2 flex-1 text-left">
                <SelectItemText>
                  <span className={isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}>
                    {config.label}
                  </span>
                </SelectItemText>
                <SelectItemIndicator className="ml-auto shrink-0">
                  <svg
                    className="w-3.5 h-3.5 text-info"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </SelectItemIndicator>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
