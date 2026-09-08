import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { StatusCategory } from '../../../shared/types';

export const CARD_ATTRIBUTE = 'data-plan-item-id';
export const COLUMN_ATTRIBUTE = 'data-board-column';

interface BoardKeyboardOptions {
  boardRef: RefObject<HTMLDivElement | null>;
  onSelectItem: (id: string | null, addToSelection?: boolean) => void;
  onMoveItem: (itemId: string, newStatus: StatusCategory) => void;
  onEscape: () => void;
}

function columnsIn(board: HTMLElement): HTMLElement[] {
  return Array.from(board.querySelectorAll<HTMLElement>(`[${COLUMN_ATTRIBUTE}]`));
}

function cardsIn(column: HTMLElement): HTMLElement[] {
  return Array.from(column.querySelectorAll<HTMLElement>(`[${CARD_ATTRIBUTE}]`));
}

function isTextEntry(element: HTMLElement): boolean {
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

/**
 * Keyboard operation for the board: roving focus across columns, activation, and
 * status moves. Moves route through the same handler as drag-and-drop so both
 * gestures inherit the agent-lifecycle guards.
 */
export function useBoardKeyboard({
  boardRef,
  onSelectItem,
  onMoveItem,
  onEscape,
}: BoardKeyboardOptions) {
  // A moved card remounts under a different column, so its focus has to be
  // restored once the store round-trip lands it there.
  const pendingFocusIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingId = pendingFocusIdRef.current;
    if (!pendingId) return;
    const card = boardRef.current?.querySelector<HTMLElement>(
      `[${CARD_ATTRIBUTE}="${CSS.escape(pendingId)}"]`,
    );
    if (!card) return;
    pendingFocusIdRef.current = null;
    card.focus();
  });

  const focusCard = useCallback(
    (card: HTMLElement) => {
      const itemId = card.getAttribute(CARD_ATTRIBUTE);
      if (!itemId) return;
      card.focus();
      onSelectItem(itemId, false);
    },
    [onSelectItem],
  );

  return useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const board = boardRef.current;
      const target = event.target as HTMLElement;

      // Text entry keeps every key, including Escape — closing the detail pane
      // out from under a half-written message would discard it.
      if (isTextEntry(target)) return;

      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      if (!board || !target.hasAttribute(CARD_ATTRIBUTE)) return;

      // A stale pending focus must never outlive the next keystroke.
      pendingFocusIdRef.current = null;

      const itemId = target.getAttribute(CARD_ATTRIBUTE);
      if (!itemId) return;

      const column = target.closest<HTMLElement>(`[${COLUMN_ATTRIBUTE}]`);
      if (!column) return;

      const columns = columnsIn(board);
      const columnIndex = columns.indexOf(column);
      const cards = cardsIn(column);
      const cardIndex = cards.indexOf(target);

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          const next = cards[cardIndex + (event.key === 'ArrowDown' ? 1 : -1)];
          if (!next) return;
          event.preventDefault();
          focusCard(next);
          return;
        }

        case 'ArrowRight':
        case 'ArrowLeft': {
          const step = event.key === 'ArrowRight' ? 1 : -1;

          if (event.metaKey || event.ctrlKey) {
            const destination = columns[columnIndex + step];
            const newStatus = destination?.getAttribute(COLUMN_ATTRIBUTE) as StatusCategory | undefined;
            if (!newStatus) return;
            event.preventDefault();
            pendingFocusIdRef.current = itemId;
            onMoveItem(itemId, newStatus);
            return;
          }

          const neighbour = columns[columnIndex + step];
          if (!neighbour) return;
          const neighbourCards = cardsIn(neighbour);
          if (neighbourCards.length === 0) return;
          event.preventDefault();
          focusCard(neighbourCards[Math.min(cardIndex, neighbourCards.length - 1)]);
          return;
        }
      }
    },
    [boardRef, focusCard, onMoveItem, onEscape],
  );
}
