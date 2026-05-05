/**
 * Shared popover primitive.
 *
 * Thin wrapper over `@radix-ui/react-popover` that bakes in:
 * - KPM surface styling (border, shadow, surface-elevated background)
 * - Modal-layer-aware z-index (`useModalLayer() + 10`) so popovers spawned
 *   inside a Modal sit above it instead of behind
 * - Sensible defaults for `sideOffset` and `collisionPadding`
 *
 * Usage mirrors Radix:
 *
 *   <Popover open={open} onOpenChange={setOpen}>
 *     <PopoverTrigger asChild><button>…</button></PopoverTrigger>
 *     <PopoverContent>…body…</PopoverContent>
 *   </Popover>
 *
 * The exported names match Radix's component names so the API is portable;
 * future callers can swap our wrapper for raw Radix if they need an escape
 * hatch.
 */

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { useModalLayer } from './ModalLayerContext';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

type PopoverContentProps = ComponentPropsWithoutRef<typeof RadixPopover.Content> & {
  /** Override the modal-layer-derived z-index. Rarely needed. */
  zIndex?: number;
};

/**
 * Wrapped popover content: portal + standard surface styling + modal-aware
 * z-index. Forwards every other Radix `Content` prop (`side`, `align`,
 * `sideOffset`, `collisionPadding`, `onOpenAutoFocus`, etc.). Call sites that
 * should keep focus on the trigger can pass `onOpenAutoFocus={(e) =>
 * e.preventDefault()}` explicitly.
 */
export const PopoverContent = forwardRef<
  ElementRef<typeof RadixPopover.Content>,
  PopoverContentProps
>(function PopoverContent(
  {
    children,
    className = '',
    style,
    side = 'bottom',
    align = 'start',
    sideOffset = 6,
    collisionPadding = 8,
    onOpenAutoFocus,
    zIndex,
    ...rest
  },
  ref,
) {
  const modalLayer = useModalLayer();
  const resolvedZIndex = zIndex ?? modalLayer + 10;

  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onOpenAutoFocus={onOpenAutoFocus}
        className={`bg-surface-elevated rounded-xl overflow-hidden border border-border-default outline-none ${className}`}
        style={{
          zIndex: resolvedZIndex,
          boxShadow:
            '0 16px 40px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          ...style,
        }}
        {...rest}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
});
