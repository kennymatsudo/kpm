import { useState, type KeyboardEvent, type ClipboardEvent, type DragEvent, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores';
import { deleteTempImage, saveTempImage } from '../../services/tempImageService';
import { useShallow } from 'zustand/react/shallow';
import { ModelSelector } from './ModelSelector';

const WORKSPACE_PLACEHOLDERS = [
  'Explain how authentication works...',
  'Draft a technical spec for...',
  'Summarize these files...',
  'Help me understand this codebase...',
];

const PLAN_PLACEHOLDERS = [
  'Create a task to refactor the...',
  'Break this feature into subtasks...',
  "What's left to do on this project?",
  'Generate a test plan for...',
];

interface ChatInputProps {
  onCancel: () => void;
  disabled?: boolean;
  /** Handler for adding files dragged from file tree to chat context */
  addFocusedResource?: (resource: FocusedResource) => void;
  /** Current view mode for placeholder customization */
  currentView?: ChatViewMode;
}

export function ChatInput({ onSend, onCancel, disabled, addFocusedResource, currentView }: ChatInputProps) {
  // Draft message and streaming state from viewed session
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      viewedSession: session,
      setDraftMessage: state.setDraftMessage,
      getChatSessionId: state.getChatSessionId,
      getOrCreateSession: state.getOrCreateSession,
    };
  }));

  const isStreaming = viewedSession?.isStreaming ?? false;
  const suggestions = viewedSession?.suggestions ?? [];

    const sessionId = viewedSessionId ?? getChatSessionId();
    getOrCreateSession(sessionId);
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Placeholder: use SDK suggestions when available, fall back to static rotation
  const fallbackPlaceholders = currentView === 'plan' ? PLAN_PLACEHOLDERS : WORKSPACE_PLACEHOLDERS;
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Reset suggestion index when new suggestions arrive
  const suggestionsKey = suggestions.join('|');
  useEffect(() => {
    setSuggestionIndex(0);
  }, [suggestionsKey]);

  // Rotate placeholder on focus
  const handleFocus = useCallback(() => {
    if (suggestions.length > 0) {
      setSuggestionIndex((prev) => (prev + 1) % suggestions.length);
    } else {
      setFallbackIndex((prev) => (prev + 1) % fallbackPlaceholders.length);
    }
  }, [suggestions.length, fallbackPlaceholders.length]);

  const currentPlaceholder = disabled
    ? 'Select a project first'
    : suggestions.length > 0
      ? suggestions[suggestionIndex % suggestions.length]

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Re-focus textarea when streaming ends, but only if the user
  // hasn't moved focus to another interactive element in the app.
  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && !disabled) {
      const active = document.activeElement;
      const focusIsIdle = !active || active === document.body;
      if (focusIsIdle) {
        textareaRef.current?.focus();
      }
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, disabled]);

  // Escape key to cancel streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== 'Escape' || !isStreaming) {
        return;
      }

      const container = containerRef.current;
      const activeElement = document.activeElement;
      const target = e.target instanceof Node ? e.target : null;
      const eventInsideChat = !!container && !!target && container.contains(target);
      const focusInsideChat = !!container && !!activeElement && container.contains(activeElement);

      if (eventInsideChat || focusInsideChat) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, onCancel]);

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check if clipboard contains an image
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior

        const blob = item.getAsFile();
        if (!blob) continue;

        try {
          // Convert blob to Uint8Array
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Save via IPC
          const result = await saveTempImage(uint8Array, blob.type);

          if (result.success) {
          } else {
          }
        } catch (error) {
          console.error('Failed to process pasted image:', error);
        }

        break; // Only handle first image
      }
    }
    // If no image found, allow default text paste behavior
  };


    // Delete file in background (best-effort, stale cleanup handles orphans)
    try {
      await deleteTempImage(pathToRemove);
    } catch (error) {
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
      const chatSessionId = viewedSessionId ?? getChatSessionId();
      getOrCreateSession(chatSessionId);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Tab accepts the current suggestion into the textarea
    if (e.key === 'Tab' && !e.shiftKey && suggestions.length > 0 && !message.trim()) {
      e.preventDefault();
      const suggestion = suggestions[suggestionIndex % suggestions.length];
      setMessage(suggestion);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only trigger if leaving the actual container (not child elements)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/x-kpm-file');

      }
    }
  }, [addFocusedResource]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone indicator */}
      {isDragOver && (
        </div>
      )}

        <div className="flex flex-wrap gap-2 mb-2">
          ))}
        </div>
      )}

        </div>
      )}

        <textarea
          ref={textareaRef}
          value={message}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleFocus}
          placeholder={currentPlaceholder}
          rows={1}
        />

          <button
          >
            </svg>
          </button>
      </div>
    </div>
  );
}
