export function GitBranchIcon({ className = 'w-4 h-4' }: { className?: string }) {
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
        strokeWidth={1.5}
        d="M6 4v10.5M6 20a2 2 0 100-4 2 2 0 000 4zM6 6a2 2 0 100-4 2 2 0 000 4zM18 10a2 2 0 100-4 2 2 0 000 4zM18 10c0 4-3 4.5-6 5"
      />
    </svg>
  );
}
