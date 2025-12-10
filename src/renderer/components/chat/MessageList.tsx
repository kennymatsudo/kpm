import { processMessageContent } from '../../utils/messageFormatter';

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

});

  return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
    </div>
  );
});



  if (messages.length === 0 && !isStreaming) {
  }

  return (


    </div>
  );
}
