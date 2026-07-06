import type { CSSProperties } from 'react';
import { Chat } from './index';
import { ChatHeader } from './ChatHeader';
import { ErrorBoundary } from '../app/ErrorBoundary';
import type { ChatViewMode } from '../../../shared/types';

interface ChatPanelProps {
  view: Extract<ChatViewMode, 'plan' | 'workspace'>;
  showDivider?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ChatPanel({ view, showDivider, className, style }: ChatPanelProps) {
  return (
    <div className={`panel-right flex flex-col min-w-0 ${className ?? ''}`} style={style}>
      <ChatHeader />
      {showDivider && <div className="divider mx-4" />}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary name="Chat">
          <Chat currentView={view} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
