interface MessageCircleIconProps {
  className?: string;
}

export function MessageCircleIcon({ className = 'w-4 h-4' }: MessageCircleIconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M8 10h8M8 14h5m-1 7-4-4H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-2l-4 4Z"
      />
    </svg>
  );
}
