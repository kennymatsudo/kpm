/**
 * DetailChatInput - Free-text input for a terminal/awaiting agent session.
 *
 * Only rendered when the agent is NOT working — the LiveProgressFooter owns the
 * working state. Behavior by state:
 * - waiting_for_input: respond mode (Gemini-only path)
 * - complete/failed/stopped: follow-up mode
 *
 * Exposes an imperative `focus()` so the Next-action strip can route "Answer" /
 * "Give new instructions" here.
 */

import { memo, forwardRef, useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import { respondToAgent, followUpAgent } from '../../services/agentSessionService';
import { toast } from '../../stores';
import type { AgentSessionState } from '../../../shared/types';

export interface DetailChatInputHandle {
  focus: () => void;
}

interface DetailChatInputProps {
  devSessionId: string;
  agentState: AgentSessionState | undefined;
}

function getPlaceholder(state: AgentSessionState | undefined): string {
  switch (state) {
    case 'working':
    case 'starting':
      return 'Agent is working...';
    case 'waiting_for_input':
      return 'Answer the question...';
    case 'complete':
      return 'Ask for changes...';
    case 'failed':
    case 'stopped':
      return 'Give new instructions...';
    case undefined:
      return 'Send a message...';
  }
}

export const DetailChatInput = memo(forwardRef<DetailChatInputHandle, DetailChatInputProps>(
  function DetailChatInput({ devSessionId, agentState }, ref) {
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }), []);

    const placeholder = getPlaceholder(agentState);

    // Auto-resize textarea
    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      }
    }, [text]);

    const handleSend = useCallback(async () => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setIsSending(true);
      try {
        const result = agentState === 'waiting_for_input'
          ? await respondToAgent({ devSessionId, text: trimmed })
          : await followUpAgent({ devSessionId, text: trimmed });

        if (!result.success) {
          toast.error(result.error || 'Failed to send message to agent');
          return;
        }

        toast.info(agentState === 'waiting_for_input' ? 'Sent response' : 'Sent follow-up');
        setText('');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to send message to agent');
      } finally {
        setIsSending(false);
      }
    }, [text, isSending, agentState, devSessionId]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    }, [handleSend]);

    return (
      <div className="px-3 py-2 border-t border-border-subtle bg-surface-1">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder={placeholder}
            rows={1}
            className={`
              flex-1 text-sm bg-surface-0 border border-border-subtle rounded-lg px-3 py-2
              text-text-primary placeholder-text-muted resize-none
              focus:outline-none focus:ring-1 focus:ring-accent
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isSending || !text.trim()}
            className={`
              shrink-0 p-2 rounded-lg transition-colors
              ${isSending || !text.trim()
                ? 'text-text-muted cursor-not-allowed'
                : 'text-accent hover:bg-accent/10'
              }
            `}
            title="Send (Enter)"
            aria-label="Send"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  },
));
