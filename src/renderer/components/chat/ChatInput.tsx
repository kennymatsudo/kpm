import { useState, type KeyboardEvent, type ClipboardEvent, type DragEvent, type SyntheticEvent, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores';
import { deleteTempImage, saveTempImage } from '../../services/tempImageService';
import { isSupportedImageFormat } from '../../../shared/ipc/tempImageEndpoints';
import { ContextWindowBar } from './ContextWindowBar';
import {
  pickChatAttachments,
  saveDroppedFile,
} from '../../services/attachmentService';
import { useShallow } from 'zustand/react/shallow';
import { ChatColumn } from './ChatColumn';
import { ModelSelector } from './ModelSelector';
import { AttachmentChip } from './AttachmentChip';
import { SlashCommandMenu } from './SlashCommandMenu';
import { useSlashCommandTypeahead } from './useSlashCommandTypeahead';
import { CHAT_STYLES } from '../../constants/chatStyles';
import { CODEX_CHAT_MODELS } from '../../../shared/types';
import { getProviderCapabilities } from '../../../shared/providerCapabilities';
import type { ChatAttachment, FocusedResource, ChatViewMode } from '../../../shared/types';
import { findPiProviderOption } from '../../stores/chat/piProviderSelection';

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

const NO_ATTACHMENTS: ChatAttachment[] = [];
const NO_SUGGESTIONS: string[] = [];

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
  const {
    viewedSessionId,
    viewedSessionDraftMessage,
    viewedSessionModel,
    viewedSessionProvider,
    viewedSessionContextWindow,
    attachments,
    isStreaming,
    suggestions,
    lastTurnUsage,
    setDraftMessage,
    setPendingAttachments,
    getChatSessionId,
    getOrCreateSession,
  } = useChatStore(useShallow((state) => {
    const session = state.viewedSessionId ? state.sessions.get(state.viewedSessionId) : null;
    return {
      viewedSessionId: state.viewedSessionId,
      viewedSessionDraftMessage: session?.draftMessage ?? '',
      viewedSessionModel: session?.provider === 'pi' && session.piProviderModel
        ? session.piProviderModel
        : session?.provider === 'codex'
          ? session.codexModel
          : session?.model,
      viewedSessionProvider: session?.provider ?? state.provider,
      viewedSessionContextWindow: session?.provider === 'pi'
        ? findPiProviderOption(state.piProviders, session.piProviderModel)?.contextWindow
        : session?.provider === 'codex'
          ? CODEX_CHAT_MODELS.find((option) => option.value === session.codexModel)?.contextWindow
          : undefined,
      attachments: session?.pendingAttachments ?? NO_ATTACHMENTS,
      isStreaming: session?.isStreaming ?? false,
      suggestions: session?.suggestions ?? NO_SUGGESTIONS,
      lastTurnUsage: session?.lastTurnUsage ?? null,
      setDraftMessage: state.setDraftMessage,
      setPendingAttachments: state.setPendingAttachments,
      getChatSessionId: state.getChatSessionId,
      getOrCreateSession: state.getOrCreateSession,
    };
  }));

  const sendDisabledWhileStreaming = false;

  // Local draft state so keystrokes feel instant: the textarea never waits on a
  // global store write (which replaces the session object and re-renders its
  // subscribers). The store is the durable copy — persists across view switches
  // and first-keystroke session creation — so we mirror local → store on idle,
  // on blur, on send, and on unmount rather than on every character.
  const [draft, setDraft] = useState(viewedSessionDraftMessage);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ sessionId: string; value: string } | null>(null);
  const syncedSessionRef = useRef(viewedSessionId);

  const flushDraft = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending) {
      getOrCreateSession(pending.sessionId);
      setDraftMessage(pending.sessionId, pending.value);
      pendingRef.current = null;
    }
  }, [getOrCreateSession, setDraftMessage]);

  // Typing path: update local immediately; persist to the store on idle.
  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    const sessionId = viewedSessionId ?? getChatSessionId();
    // Ensure a session exists right away (first keystroke) — cheap when it
    // already does — but defer the per-character draft write.
    getOrCreateSession(sessionId);
    pendingRef.current = { sessionId, value };
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushDraft, 200);
  }, [viewedSessionId, getChatSessionId, getOrCreateSession, flushDraft]);

  // Programmatic path (slash-command accept, suggestion accept, clear-on-send):
  // set local and store together, no debounce.
  const setMessage = useCallback((value: string) => {
    setDraft(value);
    pendingRef.current = null;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const sessionId = viewedSessionId ?? getChatSessionId();
    getOrCreateSession(sessionId);
    setDraftMessage(sessionId, value);
  }, [viewedSessionId, getChatSessionId, getOrCreateSession, setDraftMessage]);

  const message = draft;
  const [cursorPosition, setCursorPosition] = useState(message.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Re-sync the local draft only when the viewed session changes — flush the
  // previous session's pending edit first so nothing is lost on the swap.
  useEffect(() => {
    if (syncedSessionRef.current !== viewedSessionId) {
      flushDraft();
      syncedSessionRef.current = viewedSessionId;
      const nextDraft = viewedSessionDraftMessage;
      setDraft(nextDraft);
      setCursorPosition(nextDraft.length);
    }
  }, [viewedSessionId, viewedSessionDraftMessage, flushDraft]);

  // Persist any pending edit if the composer unmounts (e.g., view switch).
  useEffect(() => () => flushDraft(), [flushDraft]);

  // Tracks the caret so the slash-command typeahead can trigger wherever the
  // user is typing, not just the start of the draft.
  const handleSelectionChange = useCallback((e: SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition(e.currentTarget.selectionStart);
  }, []);

  const setAttachments = useCallback((updater: ChatAttachment[] | ((prev: ChatAttachment[]) => ChatAttachment[])) => {
    const sessionId = viewedSessionId ?? getChatSessionId();
    getOrCreateSession(sessionId);
    const current = useChatStore.getState().sessions.get(sessionId)?.pendingAttachments ?? [];
    const next = typeof updater === 'function' ? updater(current) : updater;
    setPendingAttachments(sessionId, next);
  }, [viewedSessionId, setPendingAttachments, getChatSessionId, getOrCreateSession]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const capabilities = getProviderCapabilities(viewedSessionProvider ?? 'claude');
  const visibleSuggestions = capabilities.promptSuggestions ? suggestions : NO_SUGGESTIONS;

  // Slash command typeahead is shown only for providers that support live slash commands.
  const slashTypeahead = useSlashCommandTypeahead(
    message,
    cursorPosition,
    setMessage,
    setCursorPosition,
    !disabled && capabilities.liveSlashCommands,
    textareaRef,
  );
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Placeholder: use SDK suggestions when available, fall back to static rotation
  const fallbackPlaceholders = currentView === 'plan' ? PLAN_PLACEHOLDERS : WORKSPACE_PLACEHOLDERS;
  // Start with the canonical "Reply or ask a follow-up…" prompt; rotate to
  // view-specific examples only after the user focuses the input.
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Reset suggestion index when new suggestions arrive
  const suggestionsKey = visibleSuggestions.join('|');
  useEffect(() => {
    setSuggestionIndex(0);
  }, [suggestionsKey]);

  // Rotate placeholder on focus
  const handleFocus = useCallback(() => {
    if (visibleSuggestions.length > 0) {
      setSuggestionIndex((prev) => (prev + 1) % visibleSuggestions.length);
    } else {
      setFallbackIndex((prev) => (prev + 1) % fallbackPlaceholders.length);
    }
  }, [visibleSuggestions.length, fallbackPlaceholders.length]);

  const currentPlaceholder = disabled
    ? 'Select a project first'
    : visibleSuggestions.length > 0
      ? visibleSuggestions[suggestionIndex % visibleSuggestions.length]
      : (fallbackPlaceholders[fallbackIndex] ?? DEFAULT_PLACEHOLDER);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_STYLES.composer.maxHeightPx)}px`;
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

        if (!isSupportedImageFormat(blob.type)) {
          setAttachmentError('Unsupported image format. Supported: PNG, JPEG, GIF, WebP, BMP');
          break;
        }

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
      setCursorPosition(0);
      setAttachments([]);
      setAttachmentError(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Menu navigation wins over send (Enter) and placeholder accept (Tab)
    if (slashTypeahead.handleKeyDown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Enter must obey the same gate as the Send button. When the composer is
      // disabled (no project) or a follow-up is already queued, swallow the
      // keypress instead of optimistically sending and letting the backend
      // reject it — that path flashed a bubble in, then yanked it back out.
      if (disabled || sendDisabledWhileStreaming) return;
      handleSend();
    }
    // Tab accepts the current suggestion into the textarea
    if (e.key === 'Tab' && !e.shiftKey && visibleSuggestions.length > 0 && !message.trim()) {
      e.preventDefault();
      const suggestion = visibleSuggestions[suggestionIndex % visibleSuggestions.length];
      setMessage(suggestion);
      setCursorPosition(suggestion.length);
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
      className={`flex-shrink-0 p-2 transition-colors ${isDragOver ? 'bg-accent/10 ring-2 ring-accent/50 ring-inset rounded-lg' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatColumn>
      {/* Drop zone indicator */}
      {isDragOver && (
        <div className="collapse-reveal mb-2 px-3 py-2 bg-accent-subtle text-accent text-xs rounded-lg text-center">
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
        <div className="collapse-reveal mb-2 px-3 py-2 bg-danger-muted text-danger text-xs rounded-lg">
          {attachmentError}
        </div>
      )}

      {/* Context window usage — sits below the composer, inside the input padding zone */}
      {viewedSessionId && (
        <ContextWindowBar
          usage={lastTurnUsage}
          model={viewedSessionModel}
          provider={viewedSessionProvider}
          contextWindow={viewedSessionContextWindow}
        />
      )}

      {/* Argument hint for the chosen slash command, until arguments are typed */}
      {slashTypeahead.pendingHint && (
        <div className="collapse-reveal mb-2 px-3 py-1.5 bg-surface-2/60 rounded-lg text-xs flex items-center gap-2 min-w-0">
          <span className="font-mono text-text-secondary whitespace-nowrap">/{slashTypeahead.pendingHint.name}</span>
          {slashTypeahead.pendingHint.argumentHint && (
            <span className="font-mono text-text-muted whitespace-nowrap">{slashTypeahead.pendingHint.argumentHint}</span>
          )}
          {slashTypeahead.pendingHint.source === 'pi-template' && (
            <span className="rounded border border-border-default px-1 py-0.5 text-xxs text-text-muted whitespace-nowrap">pi template</span>
          )}
          <span className="text-text-muted truncate">{slashTypeahead.pendingHint.description}</span>
        </div>
      )}

      {/* Single rounded composer panel: textarea on top, action row below.
          The relative wrapper anchors the slash command popover above it. */}
      <div className="relative">
      {(slashTypeahead.isOpen || slashTypeahead.showEmptyState) && (
        <SlashCommandMenu
          matches={slashTypeahead.matches}
          highlightIndex={slashTypeahead.highlightIndex}
          onHighlight={slashTypeahead.setHighlightIndex}
          onSelect={slashTypeahead.accept}
          showEmptyState={slashTypeahead.showEmptyState}
        />
      )}
      <div className="rounded-xl border border-border-default bg-surface-2/60 transition-all duration-150 focus-within:border-accent/40 focus-within:bg-surface-2/80 focus-within:ring-4 focus-within:ring-accent/10">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            handleDraftChange(e.target.value);
            setCursorPosition(e.target.selectionStart);
          }}
          onSelect={handleSelectionChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleFocus}
          onBlur={flushDraft}
          placeholder={currentPlaceholder}
          disabled={disabled || sendDisabledWhileStreaming}
          rows={1}
          className="w-full bg-transparent border-0 outline-none px-3.5 pt-3 pb-1 resize-none text-sm leading-relaxed text-text-primary placeholder:text-text-muted caret-accent selection:bg-accent/30 transition-[height] duration-100 ease-out"
          style={{ minHeight: `${CHAT_STYLES.composer.minHeightPx}px`, maxHeight: `${CHAT_STYLES.composer.maxHeightPx}px` }}
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
            className="btn btn-primary h-8 w-8 !p-0 flex-shrink-0 rounded-lg transition-transform active:scale-90"
            title={
              sendDisabledWhileStreaming
                ? 'Wait for the current response to finish'
                : isStreaming
                  ? 'Add to current response (Enter)'
                  : 'Send message (Enter)'
            }
            aria-label={isStreaming ? 'Add to current response' : 'Send message'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      </div>
      </ChatColumn>
    </div>
  );
}
