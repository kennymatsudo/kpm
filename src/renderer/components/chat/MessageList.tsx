import { useChatStore, type Activity, type MessageSegment } from '../../stores';
import { processMessageContent } from '../../utils/messageFormatter';
import { CopyIcon, CheckIcon } from '../icons';

/** Extract text content from message segments for copy/display */
function getTextContent(segments: MessageSegment[]): string {
  return segments
    .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
    .map((s) => s.content)
    .join('');
}

/** Parse user message to extract image attachments and clean content */
function parseUserMessage(content: string): { cleanContent: string; imageCount: number } {
  const imagePrefix = /^Images attached \(use Read tool to view\):\n((?:- [^\n]+\n)+)\n/;
  const match = imagePrefix.exec(content);

  if (match) {
    const imageLines = match[1].trim().split('\n');
    const imageCount = imageLines.length;
    const cleanContent = content.slice(match[0].length);
    return { cleanContent, imageCount };
  }

  return { cleanContent: content, imageCount: 0 };
}

const PlanUpdateIndicator = memo(function PlanUpdateIndicator() {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
      <div className="w-1.5 h-1.5 rounded-full bg-info animate-pulse" />
      <span className="text-xs text-info">Plan update proposed</span>
    </div>
  );
});

/** Copy button that appears on hover */
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
  );
});

  return (
    </div>
  );
});

};

  return (
        <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <ul className="text-text-secondary text-sm space-y-2.5 mb-5">
          <li key={idx} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/40 flex-shrink-0" />
            {suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
});

/** Render assistant message segments within a single bubble */
const AssistantMessageContent = memo(function AssistantMessageContent({
  segments,
}: {
  segments: MessageSegment[];
}) {
  const fullText = useMemo(() => getTextContent(segments), [segments]);
  const processed = useMemo(() => processMessageContent(fullText), [fullText]);

  return (
    <>
        return (
            </Markdown>
          </div>
        );
      })}
      <CopyButton content={processed.displayContent} />
      {processed.hasPlanUpdate && <PlanUpdateIndicator />}
    </>
  );
});

/** Render streaming segments within a single bubble */
const StreamingContent = memo(function StreamingContent({
  segments,
  activities,
}: {
  segments: MessageSegment[];
  activities: Activity[];
}) {
  return (
    <>
        return (
            </Markdown>
          </div>
        );
      })}
    </>
  );
});

  const isUser = message.role === 'user';
  const textContent = useMemo(() => getTextContent(message.segments), [message.segments]);
  const userParsed = useMemo(
  );

  return (

        </div>
      </div>
    </div>
  );
});

interface MessageListProps {
  currentView?: ChatViewMode;
}

  const isInitialMount = useRef(true);

    if (isInitialMount.current) {
      isInitialMount.current = false;
    }

  if (messages.length === 0 && !isStreaming) {
  }

  return (
          </div>


    </div>
  );
}
