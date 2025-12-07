
interface StatusSelectorProps {
  value: StatusCategory | null;
  onChange: (status: StatusCategory) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const STATUS_OPTIONS: StatusCategory[] = [
  'not_started',
  'in_progress',
  'done',
];

export function StatusSelector({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: StatusSelectorProps) {
  const currentConfig = value ? STATUS_CATEGORY_CONFIG[value] : null;

  return (
        className={`
          inline-flex items-center gap-1 font-medium rounded transition-all duration-150
          ${sizeClasses}
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
