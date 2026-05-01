/**
 * Inline chip for `@plan/<uuid>` references in rendered markdown.
 *
 * Resolves the UUID against the current plan store. Hover or click opens a
 * preview popover with `<PlanItemPreviewBody>` — preview shows from anywhere
 * the chip is rendered (chat, plan-item descriptions, documents), no view
 * switch required. Unresolved refs render with muted styling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast, usePlanDomainStore, useProjectUiDomainStore } from '../../stores';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { selectNormalizedPlanItems } from '../../stores/project/selectors';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { PlanItemPreviewBody } from './PlanItemPreviewBody';

const HOVER_OPEN_DELAY_MS = 220;
const HOVER_CLOSE_DELAY_MS = 140;

interface PlanRefChipProps {
  id: string;
}

export function PlanRefChip({ id }: PlanRefChipProps) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once the user pointer-downs inside the popover, "pin" it: hover-leave
  // timers stop running and dismissal goes through Radix outside-click only.
  // Prevents flicker where focus shifts inside the popover transiently re-
  // trigger our hover-close logic.
  const pinnedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    if (pinnedRef.current) return;
    clearTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const item = usePlanDomainStore((state) => {
    const { byId } = selectNormalizedPlanItems(state.planItems);
    return byId.get(id) ?? null;
  });

  const { addFocusedResource } = useProjectUiDomainStore(
    useShallow((state) => ({ addFocusedResource: state.addFocusedResource }))
  );

  if (!item) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface-2 text-text-muted line-through align-baseline"
        title={`Plan item not found: ${id}`}
      >
        @plan
      </span>
    );
  }

  const statusConfig = item.status_category
    ? STATUS_CATEGORY_CONFIG[item.status_category]
    : null;

  const handleAddToContext = () => {
    const result = addFocusedResource({
      type: 'plan_item',
      id: item.id,
      title: item.title,
    });
    if (result.added) toast.success(`Added "${item.title}" to chat context`);
    else toast.info(`"${item.title}" is already in chat context`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearTimers();
        if (!next) pinnedRef.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clearTimers();
            pinnedRef.current = true;
            setOpen(true);
          }}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          title={item.title}
        >
          <span className="truncate max-w-[16rem]">{item.title}</span>
          {item.external_key ? (
            <span className="text-text-muted font-normal">{item.external_key}</span>
          ) : null}
          {statusConfig ? (
            <span
              className={`px-1 rounded text-[10px] font-medium ${statusConfig.bgClass} ${statusConfig.textClass}`}
            >
              {statusConfig.label}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={clearTimers}
        onMouseLeave={scheduleClose}
        onPointerDownCapture={() => {
          pinnedRef.current = true;
          clearTimers();
        }}
      >
        <PlanItemPreviewBody
          item={item}
          onDismiss={() => {
            clearTimers();
            pinnedRef.current = false;
            setOpen(false);
          }}
          onAddToContext={handleAddToContext}
        />
      </PopoverContent>
    </Popover>
  );
}
