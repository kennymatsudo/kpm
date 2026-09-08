import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Message, MessageSegment } from '../../stores/chat';
import { TooltipProvider } from '../ui';
import { MessageRow, StreamingTurn } from './MessageList';

/** Every `chat-message-content` wrapper in a render, in document order — a
 * turn should carry exactly one, contributed by a single ancestor, so a
 * second one nested inside it (or a drifted className) is visible here even
 * though it's invisible to a test that renders one leaf component alone. */
function extractContentWrapperClasses(html: string): string[] {
  return [...html.matchAll(/class="([^"]*\bchat-message-content\b[^"]*)"/g)].map((m) => m[1]);
}

const segments: MessageSegment[] = [{ type: 'text', content: 'Here is the answer.' }];

const finalizedMessage: Message = {
  id: 'm1',
  role: 'assistant',
  segments,
  timestamp: new Date(),
};

function renderFinalized(): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <MessageRow message={finalizedMessage} />
    </TooltipProvider>
  );
}

function renderStreaming(streamSegments: MessageSegment[]): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <StreamingTurn
        segments={streamSegments}
        activities={[]}
        elapsedSeconds={3}
        isMergeableContinuation={false}
        startedAt={null}
      />
    </TooltipProvider>
  );
}

describe('assistant turn content wrapper, rendered through its real ancestor chain', () => {
  it('contributes exactly one content wrapper on each side, with the same className', () => {
    const finalizedWrappers = extractContentWrapperClasses(renderFinalized());
    const streamingWrappers = extractContentWrapperClasses(renderStreaming(segments));

    expect(finalizedWrappers).toHaveLength(1);
    expect(streamingWrappers).toHaveLength(1);
    expect(streamingWrappers[0]).toBe(finalizedWrappers[0]);
  });

  it('holds for a segment-free (working-indicator-only) streaming turn too', () => {
    const finalizedWrappers = extractContentWrapperClasses(renderFinalized());
    const streamingWrappers = extractContentWrapperClasses(renderStreaming([]));

    expect(streamingWrappers).toHaveLength(1);
    expect(streamingWrappers[0]).toBe(finalizedWrappers[0]);
  });
});
