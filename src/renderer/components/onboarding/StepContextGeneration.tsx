import { useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { LoadingSpinner } from '../ui/LoadingButton';

interface StepContextGenerationProps {
  messages: string[];
  generatedContent: string | null;
  editableContent: string;
  onContentChange: (content: string) => void;
  error: string | null;
  isGenerating: boolean;
}

export function StepContextGeneration({
  messages,
  generatedContent,
  editableContent,
  onContentChange,
  error,
  isGenerating,
}: StepContextGenerationProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {isGenerating && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <LoadingSpinner className="w-3.5 h-3.5" />
          </div>
          <div className="bg-surface-2 rounded-lg px-3 py-2 max-h-32 overflow-y-auto font-mono text-xs text-text-muted space-y-0.5">
            {messages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {error && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-muted text-danger text-sm"
          >
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>{error}</span>
          </m.div>
        )}
      </AnimatePresence>

        <div className="flex-1 flex flex-col min-h-0 space-y-2">
          <textarea
            value={editableContent}
            onChange={e => onContentChange(e.target.value)}
            placeholder="Generated content will appear here..."
          />
        </div>
      )}
    </div>
  );
}
