/** Maps an assistant message id to the user turns whose changes card it carries.
 * The card sits on the last assistant message before the next user message, and
 * collects every earlier user turn still waiting (steered follow-ups). */
export function assignTurnCards(
  messages: { id: string; role: 'user' | 'assistant'; clientMessageId?: string }[]
): Map<string, string[]> {
  const assigned = new Map<string, string[]>();
  let pending: string[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      if (message.clientMessageId) pending.push(message.clientMessageId);
      return;
    }
    if (pending.length === 0 || messages[index + 1]?.role === 'assistant') return;
    assigned.set(message.id, pending);
    pending = [];
  });
  return assigned;
}
