import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Markdown } from 'markdown-to-jsx';
import type { ChatChoiceView, ChatMessage } from '../../../shared/types';
import { useProjectDomainStore } from '../../stores';
import { cancelChatSession, changeChatChoice, getFocusDocumentChatSession, sendChatMessage, subscribeToChatEvents } from '../../services/chatService';
import { useFocusModeStore } from '../../stores/focusModeStore';
import { markdownOptions, transformPlanRefs } from '../../utils/markdown';
import { ChevronRightIcon, CloseIcon } from '../icons';
import { ChatChoiceControls } from '../chat/ChatChoiceControls';

type FocusChatRole = 'user' | 'assistant' | 'status';

interface FocusChatMessage {
  id: string;
  role: FocusChatRole;
  content: string;
}

interface FocusChatPanelProps {
  isOpen: boolean;
  sessionId: string | null;
  docPath: string | null;
  docTitle: string;
  docContent: string;
  onClose: () => void;
}

async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toFocusChatMessages(messages: ChatMessage[]): FocusChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));
}

export function FocusChatPanel({
  isOpen,
  sessionId,
  docPath,
  docTitle,
  docContent,
  onClose,
}: FocusChatPanelProps) {
  const projectId = useProjectDomainStore((state) => state.currentProjectId);
  const [messages, setMessages] = useState<FocusChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ChatChoiceView | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamRef = useRef('');

  const canSend = !!projectId && !!sessionId && !!docPath && !isStreaming && !isLoadingSession
    && choice?.send.allowed !== false && draft.trim().length > 0;
  const composerStatus = isStreaming
    ? 'Working'
    : isLoadingSession
      ? 'Loading'
    : docPath
      ? 'Document focused'
      : 'No document selected';

  useEffect(() => {
    setMessages([]);
    setDraft('');
    setStreamingContent('');
    streamRef.current = '';
    setIsStreaming(false);
    setIsLoadingSession(false);
    setError(null);
    setChoice(null);
  }, [projectId, docPath]);

  useEffect(() => {
    if (sessionId) return;
    setStreamingContent('');
    streamRef.current = '';
    setIsStreaming(false);
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen || !projectId || !docPath || choice) return;

    let cancelled = false;

    const loadSession = async () => {
      setIsLoadingSession(true);
      setError(null);

      try {
        const contentHash = await hashText(docContent);
        if (cancelled) return;

        const result = await getFocusDocumentChatSession(
          projectId,
          docPath,
          docTitle || docPath,
          contentHash,
        );

        if (cancelled) return;

        if (!result.success || !result.chatSessionId) {
          setError(result.error ?? 'Failed to load document chat');
          return;
        }

        setMessages(toFocusChatMessages(result.messages ?? []));
        setChoice(result.choice ?? null);
        useFocusModeStore.getState().setChatSessionId(docPath, result.chatSessionId);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load document chat');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [choice, docContent, docPath, docTitle, isOpen, projectId]);

  useEffect(() => {
    if (!isOpen || !sessionId || !projectId) return;

    const unsubscribe = subscribeToChatEvents({
      onChunk: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        streamRef.current += data.text;
        setStreamingContent(streamRef.current);
        setIsStreaming(true);
      },
      onFileUpdate: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'status',
            content: `Document update proposed for \`${data.filePath}\`.`,
          },
        ]);
      },
      onDone: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        const text = streamRef.current.trim();
        if (text) {
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: 'assistant', content: text },
          ]);
        }
        streamRef.current = '';
        setStreamingContent('');
        setIsStreaming(false);
      },
      onError: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        setError(data.error);
        setIsStreaming(false);
      },
      onSessionError: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        setError(data.error);
        setIsStreaming(false);
      },
      onSessionDeactivated: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        const text = streamRef.current.trim();
        if (text) {
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: 'assistant', content: text },
          ]);
        }
        streamRef.current = '';
        setStreamingContent('');
        setIsStreaming(false);
      },
      onSessionConnecting: (data) => {
        if (data.projectId !== projectId || data.chatSessionId !== sessionId) return;
        setIsStreaming(true);
        setError(null);
      },
    });

    return () => unsubscribe();
  }, [isOpen, projectId, sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent, isOpen]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!projectId || !sessionId || !docPath || !text || isStreaming || isLoadingSession) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ]);
    setDraft('');
    setError(null);
    setIsStreaming(true);
    streamRef.current = '';
    setStreamingContent('');

    void sendChatMessage({
      projectId,
      message: text,
      focusedResources: [],
      chatSessionId: sessionId,
      currentView: 'focus',
      clientMessageId: crypto.randomUUID(),
      focusDocument: {
        path: docPath,
        title: docTitle || docPath,
        content: docContent,
      },
    }).then((result) => {
      if (!result.success) {
        setError(result.error ?? 'Failed to send message');
        setIsStreaming(false);
      }
    }).catch((sendError: unknown) => {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
      setIsStreaming(false);
    });
  }, [docContent, docPath, docTitle, draft, isLoadingSession, isStreaming, projectId, sessionId]);

  const updateChoice = useCallback(async (intent: Parameters<typeof changeChatChoice>[0]['intent']) => {
    if (!projectId || !sessionId || !choice) return;
    const result = await changeChatChoice({
      projectId,
      chatSessionId: sessionId,
      expectedRevision: choice.revision,
      intent,
    });
    if (result.success && result.choice) setChoice(result.choice);
    else setError('error' in result ? result.error : 'Failed to change Chat model choice');
  }, [choice, projectId, sessionId]);

  const cancel = useCallback(() => {
    if (!projectId || !sessionId) return;
    void cancelChatSession(projectId, sessionId);
    setIsStreaming(false);
  }, [projectId, sessionId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) send();
    }
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      cancel();
    }
  };

  const emptyState = useMemo(() => (
    <div className="flex min-h-full items-center justify-center px-5 py-10 text-center">
      <div className="max-w-[260px]">
        <p className="text-sm font-medium text-text-secondary">Ask about this document</p>
      </div>
    </div>
  ), []);

  return (
    <aside
      className={`absolute right-0 top-0 bottom-0 z-20 flex max-w-full flex-col border-l border-border-subtle bg-surface-1 shadow-xl transition-all duration-150 md:relative md:shadow-none ${
        isOpen
          ? 'w-full translate-x-0 opacity-100 sm:w-[390px] md:w-[380px]'
          : 'w-0 translate-x-full overflow-hidden opacity-0 pointer-events-none md:translate-x-0'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-text-secondary">Focus chat</div>
          <div className="truncate text-[11px] text-text-muted">{docTitle || docPath || 'Document'}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          title="Close chat"
          aria-label="Close chat"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {messages.length === 0 && !streamingContent && !isStreaming ? emptyState : null}
        <div className="space-y-3">
          {messages.map((message) => (
            <FocusChatBubble key={message.id} message={message} />
          ))}
          {(streamingContent || isStreaming) && (
            <div
              className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-0 px-3 py-2.5"
              aria-busy={isStreaming}
            >
              {streamingContent ? (
                <>
                  <div className="prose-document prose-panel text-sm">
                    <Markdown options={markdownOptions}>{transformPlanRefs(streamingContent)}</Markdown>
                  </div>
                  {isStreaming && <FocusChatActivity className="mt-3 border-t border-border-subtle/60 pt-2" />}
                </>
              ) : (
                <FocusChatActivity />
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-md border border-danger/30 bg-danger-muted px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle p-3">
        <div className="rounded-lg border border-border-default bg-surface-2/50 focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/15">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={!projectId || !sessionId || !docPath || isStreaming || isLoadingSession}
            placeholder={isStreaming ? 'Waiting for response' : isLoadingSession ? 'Loading' : 'Ask about this document'}
            className="block max-h-32 min-h-[58px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
          />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            {choice ? (
              <ChatChoiceControls
                choice={choice}
                disabled={isStreaming}
                ariaLabelPrefix="Focus chat"
                className="max-w-[255px]"
                onChange={updateChoice}
              />
            ) : null}
            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-text-muted">
              {isStreaming && <span className="pulse-dot shrink-0" style={{ width: 5, height: 5 }} />}
              <span className="truncate">{composerStatus}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {isStreaming && (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md bg-danger/15 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/25"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                title="Send"
                aria-label="Send"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function FocusChatActivity({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs text-text-muted ${className}`} aria-live="polite">
      <span className="pulse-dot shrink-0" style={{ width: 6, height: 6 }} />
      <span>Working</span>
    </div>
  );
}

function FocusChatBubble({ message }: { message: FocusChatMessage }) {
  if (message.role === 'status') {
    return (
      <div className="min-w-0 overflow-hidden rounded-md border border-accent/20 bg-accent-subtle px-3 py-2 text-xs text-accent break-words">
        <Markdown options={markdownOptions}>{message.content}</Markdown>
      </div>
    );
  }

  const isUser = message.role === 'user';
  return (
    <div className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`min-w-0 max-w-[92%] overflow-hidden rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent text-white'
            : 'border border-border-subtle bg-surface-0 text-text-primary'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="prose-document prose-panel">
            <Markdown options={markdownOptions}>{transformPlanRefs(message.content)}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
