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
