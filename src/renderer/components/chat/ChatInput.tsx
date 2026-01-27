import { useState, type KeyboardEvent, type ClipboardEvent, type DragEvent, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  // Rotate placeholder on focus
  const handleFocus = useCallback(() => {

  const currentPlaceholder = disabled
    ? 'Select a project first'

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Escape key to cancel streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
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
    } catch (error) {
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
