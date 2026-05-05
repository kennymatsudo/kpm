/**
 * Shared select primitive.
 *
 * Thin wrapper over `@radix-ui/react-select` that bakes in:
 * - KPM surface styling (border, shadow, surface-elevated background)
 * - Modal-layer-aware z-index (`useModalLayer() + 10`) so selects spawned
 *   inside a Modal sit above it instead of behind
 * - Sensible defaults for `sideOffset`, `collisionPadding`, animation
 * - Scroll buttons for long option lists
 *
 * Mirrors the structure of `Popover.tsx`: re-export Radix sub-components
 * directly, wrap only `Content` with our standard styling.
 */

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { useModalLayer } from './ModalLayerContext';

export const Select = RadixSelect.Root;
export const SelectTrigger = RadixSelect.Trigger;
export const SelectValue = RadixSelect.Value;
export const SelectGroup = RadixSelect.Group;
export const SelectLabel = RadixSelect.Label;
export const SelectSeparator = RadixSelect.Separator;
export const SelectIcon = RadixSelect.Icon;
export const SelectItemText = RadixSelect.ItemText;
export const SelectItemIndicator = RadixSelect.ItemIndicator;

/**
 * Sentinel for "no value" options. Radix Select rejects empty-string item
 * values (they're reserved to clear selection), so call sites that map
 * `'' <-> null` (or `'' <-> "no choice"`) must round-trip through this.
 *
 *   const v = state === '' ? NONE_VALUE : state;
 *   onValueChange={(next) => setState(next === NONE_VALUE ? '' : next)}
 */
export const NONE_VALUE = '__none__';

type SelectContentProps = ComponentPropsWithoutRef<typeof RadixSelect.Content> & {
  /** Override the modal-layer-derived z-index. Rarely needed. */
  zIndex?: number;
};

export const SelectContent = forwardRef<
  ElementRef<typeof RadixSelect.Content>,
  SelectContentProps
>(function SelectContent(
  {
    children,
    className = '',
    style,
    position = 'popper',
    side = 'bottom',
    align = 'start',
    sideOffset = 6,
    collisionPadding = 8,
    zIndex,
    ...rest
  },
  ref,
) {
  const modalLayer = useModalLayer();
  const resolvedZIndex = zIndex ?? modalLayer + 10;

  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position={position}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={`bg-surface-elevated rounded-xl overflow-hidden border border-border-default outline-none data-[state=open]:animate-tooltip-in data-[state=closed]:animate-tooltip-out ${className}`}
        style={{
          zIndex: resolvedZIndex,
          boxShadow:
            '0 16px 40px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          ...style,
        }}
        {...rest}
      >
        <RadixSelect.ScrollUpButton className="flex items-center justify-center h-6 text-text-muted cursor-default">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </RadixSelect.ScrollUpButton>
        <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
        <RadixSelect.ScrollDownButton className="flex items-center justify-center h-6 text-text-muted cursor-default">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </RadixSelect.ScrollDownButton>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
});

type SelectItemProps = ComponentPropsWithoutRef<typeof RadixSelect.Item>;

export const SelectItem = forwardRef<
  ElementRef<typeof RadixSelect.Item>,
  SelectItemProps
>(function SelectItem({ children, className = '', ...rest }, ref) {
  return (
    <RadixSelect.Item
      ref={ref}
      className={`dropdown-item w-full data-[disabled]:opacity-50 data-[disabled]:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </RadixSelect.Item>
  );
});
