import { useCallback, useState } from 'react';

/**
 * Remembers which process strips the user opened, keyed by turn.
 *
 * The transcript virtualizes past 40 messages, so a row scrolled out of view
 * unmounts and loses any local state. Without this, scrolling back to a turn
 * you expanded twenty messages ago silently re-collapses it. The map outlives
 * the components because it describes the reader's place in the conversation,
 * not the component's own state.
 *
 * Entries are never removed; keys carry the message id they belong to, so a
 * cleared session's keys are simply never asked about again.
 */
const openTurns = new Set<string>();

export function useTurnDisclosure(
  disclosureKey: string | undefined,
  defaultOpen = false
): [boolean, () => void] {
  const [open, setOpen] = useState(() =>
    disclosureKey ? openTurns.has(disclosureKey) : defaultOpen
  );

  const toggle = useCallback(() => {
    setOpen((previous) => {
      const next = !previous;
      if (disclosureKey) {
        if (next) openTurns.add(disclosureKey);
        else openTurns.delete(disclosureKey);
      }
      return next;
    });
  }, [disclosureKey]);

  return [open, toggle];
}
