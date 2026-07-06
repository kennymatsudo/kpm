/**
 * Result of processing a message for display
 */
export interface ProcessedMessage {
  /** The message content with plan JSON stripped */
  displayContent: string;
  /** Whether the message contained a plan update */
  hasPlanUpdate: boolean;
}

// Patterns for plan-related blocks that should be hidden from the user
const PLAN_BLOCK_PATTERNS = [
  /```json:plan\s*[\s\S]*?```/g,     // json:plan format
  /```plan-actions\s*[\s\S]*?```/g,  // plan-actions format (used by claude.ts)
];

/**
 * Strip plan-related blocks from message content.
 * These blocks are processed separately and shown in dedicated UI components.
 *
 * Note: Context file updates now use tool calls (kpm_propose_context_edit)
 * instead of text blocks, so no text stripping is needed for those.
 */
export function processMessageContent(content: string): ProcessedMessage {
  // Check if any plan block pattern matches
  const hasPlanUpdate = PLAN_BLOCK_PATTERNS.some(pattern => {
    // Reset regex state before testing
    pattern.lastIndex = 0;
    return pattern.test(content);
  });

  // Remove all plan block patterns
  let displayContent = content;
  for (const pattern of PLAN_BLOCK_PATTERNS) {
    // Reset regex state before replacing
    pattern.lastIndex = 0;
    displayContent = displayContent.replace(pattern, '');
  }

  return {
    displayContent: displayContent.trim(),
    hasPlanUpdate,
  };
}

/** Parse user message to extract image attachments and clean content */
export function parseUserMessage(content: string): { cleanContent: string; imageCount: number } {
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
