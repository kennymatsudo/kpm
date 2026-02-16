/**
 * SectionHeader - Labeled divider between search result groups.
 *
 * Uses the design system's soft gradient separator with an inline
 * label, entity icon, and result count.
 */

import type { SearchEntityType } from '../../../shared/types';
import { EntityIcon } from './EntityIcon';

const SECTION_META: Record<SearchEntityType, { label: string; color: string }> = {
  plan_item: { label: 'Tasks', color: 'text-accent' },
  document: { label: 'Documents', color: 'text-success' },
};

interface SectionHeaderProps {
  type: SearchEntityType;
  count: number;
  isFirst: boolean;
}

export function SectionHeader({ type, count, isFirst }: SectionHeaderProps) {
  const { label, color } = SECTION_META[type];

  return (
    <div className={isFirst ? 'pt-1 pb-1.5' : 'pt-3 pb-1.5'}>
      {/* Gradient divider — hidden for the first section */}
      {!isFirst && (
        <div
          className="h-px mx-3 mb-3"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--color-border-default) 15%, var(--color-border-default) 85%, transparent 100%)',
          }}
        />
      )}

      <div className="flex items-center gap-2 px-4">
        <span className={`${color} opacity-50`}>
          <EntityIcon entityType={type} className="w-3.5 h-3.5" />
        </span>
        <span className="text-xxs font-semibold uppercase tracking-widest text-text-tertiary">
          {label}
        </span>
        <span className="text-xxs text-text-muted tabular-nums">
          {count}
        </span>
      </div>
    </div>
  );
}
