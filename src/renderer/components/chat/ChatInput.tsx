import { useState, type KeyboardEvent, type ClipboardEvent, type DragEvent, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores';
import { deleteTempImage, saveTempImage } from '../../services/tempImageService';
import {
  pickChatAttachments,
  saveDroppedFile,
} from '../../services/attachmentService';
import { useShallow } from 'zustand/react/shallow';
import { ModelSelector } from './ModelSelector';
import { AttachmentChip } from './AttachmentChip';
import type { ChatAttachment, FocusedResource, ChatViewMode } from '../../../shared/types';

const WORKSPACE_PLACEHOLDERS = [
  'Reply or ask a follow-up…',
  'Explain how authentication works...',
  'Draft a technical spec for...',
  'Summarize these files...',
  'Help me understand this codebase...',
];

const PLAN_PLACEHOLDERS = [
  'Reply or ask a follow-up…',
  'Create a task to refactor the...',
  'Break this feature into subtasks...',
  "What's left to do on this project?",
  'Generate a test plan for...',
];

const DEFAULT_PLACEHOLDER = 'Reply or ask a follow-up…';

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[], chatSessionId?: string) => void;
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
      setPendingAttachments: state.setPendingAttachments,
      getChatSessionId: state.getChatSessionId,
      getOrCreateSession: state.getOrCreateSession,
    };
  }));

  const attachments = viewedSession?.pendingAttachments ?? [];
  const isStreaming = viewedSession?.isStreaming ?? false;
  const suggestions = viewedSession?.suggestions ?? [];

    const sessionId = viewedSessionId ?? getChatSessionId();
    getOrCreateSession(sessionId);

  const setAttachments = useCallback((updater: ChatAttachment[] | ((prev: ChatAttachment[]) => ChatAttachment[])) => {
    const sessionId = viewedSessionId ?? getChatSessionId();
    getOrCreateSession(sessionId);
    const current = useChatStore.getState().sessions.get(sessionId)?.pendingAttachments ?? [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    setPendingAttachments(sessionId, next);
  }, [viewedSessionId, setPendingAttachments, getChatSessionId, getOrCreateSession]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Placeholder: use SDK suggestions when available, fall back to static rotation
  const fallbackPlaceholders = currentView === 'plan' ? PLAN_PLACEHOLDERS : WORKSPACE_PLACEHOLDERS;
  // Start with the canonical "Reply or ask a follow-up…" prompt; rotate to
  // view-specific examples only after the user focuses the input.
  const [fallbackIndex, setFallbackIndex] = useState(0);
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
      : (fallbackPlaceholders[fallbackIndex] ?? DEFAULT_PLACEHOLDER);

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
            const mediaType = blob.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
            // Pasted images are always image kind. The temp-image service
            // returns the pasted bytes' actual MIME, so trust it here.
            setAttachments((prev) => [
              ...prev,
              { kind: 'image', path: result.path, filename: result.filename, mediaType },
            ]);
            setAttachmentError(null);
          } else {
            setAttachmentError(result.error);
          }
        } catch (error) {
          console.error('Failed to process pasted image:', error);
          setAttachmentError('Failed to process pasted image');
        }

        break; // Only handle first image
      }
    }
    // If no image found, allow default text paste behavior
  };

  const handleRemoveAttachment = async (pathToRemove: string) => {
    // Optimistic UI update — remove immediately using path as identifier
    setAttachments((prev) => prev.filter((a) => a.path !== pathToRemove));

    // Delete file in background (best-effort, stale cleanup handles orphans)
    try {
      await deleteTempImage(pathToRemove);
    } catch (error) {
      console.error('Failed to delete temp attachment:', error);
    }
  };

  const handlePickFiles = async () => {
    if (isPickingFiles) return;
    setIsPickingFiles(true);
    setAttachmentError(null);
    try {
      const result = await pickChatAttachments();
      if (result.picked.length > 0) {
        setAttachments((prev) => [
          ...prev,
          ...result.picked.map((p): ChatAttachment => {
            if (p.kind === 'image') {
              return {
                kind: 'image',
                path: p.path,
                filename: p.filename,
                mediaType: p.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              };
            }
            if (p.kind === 'pdf') {
              return { kind: 'pdf', path: p.path, filename: p.filename };
            }
            return { kind: 'text', path: p.path, filename: p.filename, mediaType: p.mediaType };
          }),
        ]);
      }
      if (result.errors.length > 0) {
        setAttachmentError(
          result.errors.map((e) => `${e.filename}: ${e.error}`).join(' • '),
        );
      }
    } catch (error) {
      console.error('[ChatInput] Failed to pick attachments:', error);
      setAttachmentError(
        error instanceof Error ? error.message : 'Failed to add attachments',
      );
    } finally {
      setIsPickingFiles(false);
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
    // Allow sending if there's text OR if there are attachments.
    // Sending while streaming is allowed for Claude — the backend queues this
    // as the next turn. For Codex, keep the old behavior (block until the
    // current response finishes) since its service rejects mid-stream sends.
    if ((trimmed || attachments.length > 0) && !disabled && !sendDisabledWhileStreaming) {
      const chatSessionId = viewedSessionId ?? getChatSessionId();
      getOrCreateSession(chatSessionId);
      onSend(
        trimmed || '(see attached files)',
        attachments.length > 0 ? attachments : undefined,
        chatSessionId,
      );
      setMessage('');
      setAttachments([]);
      setAttachmentError(null);
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

  // Drag-and-drop handlers — accept either KPM file-tree drags (existing
  // behavior) or OS-native file drops (new in Phase 2).
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types;
    const isKpmFile = types.includes('application/x-kpm-file');
    const isNativeFiles = types.includes('Files');
    if (isKpmFile || isNativeFiles) {
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

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    // Sidebar drags carry our custom payload — keep that path unchanged.
    const data = e.dataTransfer.getData('application/x-kpm-file');
    if (data && addFocusedResource) {
      try {
        const fileData = JSON.parse(data) as { source: string; path: string; isDirectory: boolean };
        if (fileData.source === 'project') {
          addFocusedResource({
            type: 'project_file',
            path: fileData.path,
            isDirectory: fileData.isDirectory,
          });
        }
      } catch {
        console.error('Failed to parse dropped file data');
      }
      return;
    }

    // OS-native drops — read each File, save to temp, append to attachments.
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;

    setAttachmentError(null);
    const newAttachments: ChatAttachment[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const result = await saveDroppedFile(file);
        if (!result.success) {
          errors.push(`${file.name}: ${result.error}`);
          continue;
        }
        if (result.kind === 'image') {
          newAttachments.push({
            kind: 'image',
            path: result.path,
            filename: result.filename,
            mediaType: result.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          });
        } else if (result.kind === 'pdf') {
          newAttachments.push({ kind: 'pdf', path: result.path, filename: result.filename });
        } else {
          newAttachments.push({
            kind: 'text',
            path: result.path,
            filename: result.filename,
            mediaType: result.mediaType,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read dropped file';
        errors.push(`${file.name}: ${message}`);
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    if (errors.length > 0) {
      setAttachmentError(errors.join(' • '));
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
          Drop files to attach
        </div>
      )}

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.path}
              attachment={attachment}
              onRemove={() => void handleRemoveAttachment(attachment.path)}
            />
          ))}
        </div>
      )}

      {/* Attachment error message */}
      {attachmentError && (
          {attachmentError}
        </div>
      )}

        <textarea
          ref={textareaRef}
          value={message}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleFocus}
          placeholder={currentPlaceholder}
          disabled={disabled || sendDisabledWhileStreaming}
          rows={1}
          style={{ minHeight: '40px', maxHeight: '200px' }}
        />

        {/* Action row: selectors as pill chips on the left, send on the right. */}
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <ModelSelector />
            <button
              type="button"
              onClick={() => void handlePickFiles()}
              disabled={disabled || isPickingFiles}
              className="text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors p-1.5 rounded-md hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Add attachment"
              aria-label="Add attachment"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </div>

          {/* Stop button is the only way to cancel an in-flight turn now —
              sending a new message no longer interrupts; it queues. */}
          {isStreaming && (
            <button
              onClick={onCancel}
              className="btn btn-danger h-8 w-8 !p-0 flex-shrink-0 rounded-lg"
              title="Stop generating (Esc)"
              aria-label="Stop generating"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={(!message.trim() && attachments.length === 0) || disabled || sendDisabledWhileStreaming}
            title={
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
