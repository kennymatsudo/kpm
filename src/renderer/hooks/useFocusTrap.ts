import { useEffect, useRef, useCallback, type RefObject } from 'react';

/**
 * Hook to trap focus within a container (for dialogs/modals).
 * Handles:
 * - Trapping focus within the container
 * - Auto-focusing the first focusable element (or a specific element)
 * - Restoring focus to the trigger element on close
 * - Escape key to close
 */
interface UseFocusTrapOptions {
  /** Whether the trap is active */
  isOpen: boolean;
  /** Callback when escape is pressed */
  onEscape?: () => void;
  /** Ref to element that should receive initial focus (defaults to first focusable) */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Whether to restore focus on close (default: true) */
  restoreFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onEscape,
  initialFocusRef,
  restoreFocus = true,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Store the previously focused element when opening
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Focus management when opening/closing
  useEffect(() => {
    if (!isOpen) {
      // Restore focus when closing
      if (restoreFocus && previousActiveElement.current) {
        // Use setTimeout to ensure the element is still in the DOM
        const elementToFocus = previousActiveElement.current;
          if (document.body.contains(elementToFocus)) {
            elementToFocus.focus();
          }
        }, 0);
      }
      return;
    }

    // Focus initial element when opening
    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          // If no focusable elements, focus the container itself
          container.setAttribute('tabindex', '-1');
          container.focus();
        }
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [isOpen, initialFocusRef, restoreFocus]);

  // Trap focus within container
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen || !containerRef.current) return;

    // Handle Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape?.();
      return;
    }

    // Handle Tab
    if (e.key === 'Tab') {
      const container = containerRef.current;
      const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [isOpen, onEscape]);

  // Add keyboard listener
  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  return { containerRef };
}
