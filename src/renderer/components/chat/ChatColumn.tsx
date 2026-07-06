import type { ReactNode } from 'react';

interface ChatColumnProps {
  children: ReactNode;
  className?: string;
}

export function ChatColumn({ children, className }: ChatColumnProps) {
  return (
    <div className={`mx-auto w-full max-w-[var(--chat-measure)]${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
