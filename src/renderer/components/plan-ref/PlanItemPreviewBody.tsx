/**
 * Floating preview card for a plan reference.
 *
 * Built on `@radix-ui/react-popover` — Radix handles portal, anchor positioning,
 * viewport collision, focus management, and dismissal. This file only owns the
 * preview body content (intent, criteria, description excerpt, actions).
 *
 * Designed as a body-only component; the chip wires it up as the popover
 * content. See `PlanRefChip` for the trigger side.
 */

import { useMemo } from 'react';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { TrackerIcon, trackerLabelFor } from '../tracker/shared/trackerDisplay';
import { openExternalUrl } from '../../services/shellService';
import type { PlanItem } from '../../../shared/types';
import { emit } from '../../stores';

const DESCRIPTION_EXCERPT_CHARS = 220;

interface PlanItemPreviewBodyProps {
  item: PlanItem;
  /** Called after the user picks an action that should also dismiss the popover. */
  onDismiss: () => void;
  /** Add this item to the active chat session's focused resources. */
  onAddToContext: () => void;
}

export function PlanItemPreviewBody({
  item,
  onDismiss,
  onAddToContext,
}: PlanItemPreviewBodyProps) {
  const statusConfig = item.status_category
    ? STATUS_CATEGORY_CONFIG[item.status_category]
    : null;

  const trackerType = item.external_type ?? null;
  const trackerLabel = trackerLabelFor(trackerType);

  const descriptionExcerpt = useMemo(() => {
    const desc = item.description?.trim();
    if (!desc) return null;
    if (desc.length <= DESCRIPTION_EXCERPT_CHARS) return desc;
    return desc.slice(0, DESCRIPTION_EXCERPT_CHARS).trimEnd() + '…';
  }, [item.description]);

  const criteria = item.acceptance_criteria ?? [];
  const intent = item.intent?.trim() || null;

  const handleOpenFullTask = () => {
    emit({
      type: 'navigate-to-view',
      payload: { view: 'planning', planItemId: item.id },
    });
    onDismiss();
  };

  const handleOpenTracker = () => {
    if (item.external_url) openExternalUrl(item.external_url);
  };

  return (
    <div className="w-[360px]">
      {/* Header */}
      <div className="px-4 pt-3 pb-2.5 border-b border-border-subtle">
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide pt-0.5">
            Plan Item
          </span>
          <div className="flex-1" />
          {statusConfig && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConfig.bgClass} ${statusConfig.textClass}`}
            >
              {statusConfig.label}
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-text-primary leading-snug mt-1.5">
          {item.title}
        </div>
        {item.external_key && (
          <button
            type="button"
            onClick={handleOpenTracker}
            disabled={!item.external_url}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-primary transition-colors disabled:cursor-default disabled:hover:text-text-muted"
            title={item.external_url ? `Open ${item.external_key} in ${trackerLabel}` : item.external_key}
          >
            <TrackerIcon trackerType={trackerType} className="w-3 h-3" />
            <span className="font-mono">{item.external_key}</span>
            {item.external_url && (
              <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3 max-h-[320px] overflow-y-auto">
        {intent && (
          <div>
            <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
              Intent
            </div>
            <p className="text-xs text-text-primary leading-relaxed">{intent}</p>
          </div>
        )}

        {criteria.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
              Acceptance Criteria
              <span className="ml-1.5 text-text-muted/70 normal-case">({criteria.length})</span>
            </div>
            <ul className="space-y-1">
              {criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-text-primary leading-snug">
                  <svg
                    className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" />
                  </svg>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {descriptionExcerpt && (
          <div>
            <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
              Description
            </div>
          </div>
        )}

        {!intent && criteria.length === 0 && !descriptionExcerpt && (
          <p className="text-xs text-text-muted italic">No spec or description yet.</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-border-subtle bg-surface-1/40 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            onAddToContext();
            onDismiss();
          }}
          className="px-2.5 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex items-center gap-1.5"
          title="Add to chat context"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add to context
        </button>
        <button
          type="button"
          onClick={handleOpenFullTask}
          className="px-2.5 py-1 rounded text-xs font-medium bg-accent-subtle text-accent hover:bg-accent/20 transition-colors flex items-center gap-1.5"
        >
          Open full task
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
