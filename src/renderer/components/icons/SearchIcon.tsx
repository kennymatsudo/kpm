export function SearchIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-5.2-5.2m1.7-5.1a6.8 6.8 0 11-13.6 0 6.8 6.8 0 0113.6 0z"
      />
    </svg>
  );
}
