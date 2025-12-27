import { useState, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';
import { useShallow } from 'zustand/react/shallow';
import { CloseIcon } from '../icons';

  const [lastMessage, setLastMessage] = useState<string | null>(null);

    setLastMessage(message);

  const handleRetry = useCallback(() => {
    }

  // Helper to get display label for a focused resource
  const getResourceLabel = (resource: FocusedResource): string => {
    switch (resource.type) {
      case 'plan_item':
        return resource.title;
      case 'project_file':
    }
  };

  // Helper to get icon for resource type
  const ResourceIcon = ({ type }: { type: FocusedResource['type'] }) => {
    const className = "w-3 h-3 flex-shrink-0 opacity-70";
    switch (type) {
      case 'plan_item':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        );
      case 'project_file':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'repo':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          </svg>
        );
    }
  };

  const hasFocus = focusedResources.length > 0;
  const focusCount = focusedResources.length;

  return (
      {/* Focused resources banner - animated height to prevent layout shift */}
      <div
        style={{
          height: hasFocus ? '36px' : '0px',
          padding: hasFocus ? '8px 12px' : '0 12px',
          opacity: hasFocus ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--color-accent)' }}>
            Context
          </span>
          {focusCount > 1 && (
              {focusCount}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
          {focusedResources.map((resource, idx) => (
            <button
              key={`${resource.type}-${idx}`}
              onClick={() => removeFocusedResource(resource)}
              className="text-xs text-text-primary bg-surface-2/60 hover:bg-surface-2 pl-1.5 pr-1 py-0.5 rounded-md flex items-center gap-1 max-w-[140px] group transition-colors flex-shrink-0"
              title={`Remove: ${getResourceLabel(resource)}`}
            >
              <ResourceIcon type={resource.type} />
              <span className="truncate">{getResourceLabel(resource)}</span>
              <CloseIcon className="w-2.5 h-2.5 flex-shrink-0 opacity-40 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <button
          onClick={clearFocusedResources}
          className="transition-colors flex-shrink-0 hover:bg-surface-2/50 p-1 rounded"
          style={{ color: 'color-mix(in srgb, var(--color-accent) 60%, transparent)' }}
          title="Clear all"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
          <svg className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-danger">{error}</p>
            {lastMessage && (
              <button
                onClick={handleRetry}
                className="text-xs text-danger/80 hover:text-danger underline mt-1"
              >
                Retry last message
              </button>
            )}
          </div>
          <button
            className="text-danger/60 hover:text-danger transition-colors flex-shrink-0"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <PermissionPrompt />
    </div>
  );
}
