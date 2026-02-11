/**
 * SearchResultItem - Individual result row in global search.
 */

import { m } from 'framer-motion';
import type { SearchResult } from '../../../shared/types';
import { EntityIcon } from './EntityIcon';

const ENTITY_BADGES: Record<SearchResult['entityType'], { label: string; className: string }> = {
  plan_item: { label: 'Task', className: 'bg-accent-subtle text-accent' },
  document: { label: 'Doc', className: 'bg-success/10 text-success' },
};

/** Highlights the first occurrence of `query` within `text` (case-insensitive). */
function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <span>
      {before}
      <span className="text-text-primary font-medium">{match}</span>
      {after}
    </span>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  query: string;
}

export function SearchResultItem({ result, index, isSelected, onSelect, onHover, query }: SearchResultItemProps) {
  const badge = ENTITY_BADGES[result.entityType];

  return (
    <m.button
      data-result-index={index}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`
        w-full flex items-start gap-3 px-4 py-3 rounded-xl
        transition-all duration-150 cursor-pointer text-left
        ${isSelected ? 'bg-accent-muted shadow-sm' : 'hover:bg-surface-2'}
      `}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.3) }}
    >
      {/* Entity icon */}
      <div className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>
        <EntityIcon entityType={result.entityType} className="w-4.5 h-4.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold tracking-tight truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
            {result.title}
          </span>
          {result.metadata.externalKey && (
            <span className="text-xs text-text-tertiary flex-shrink-0">{result.metadata.externalKey}</span>
          )}
        </div>
        {result.snippet && (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
            <HighlightedSnippet text={result.snippet} query={query} />
          </p>
        )}
      </div>

      {/* Badge + metadata */}
      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
        {result.metadata.statusCategory && (
          <span className="text-xs text-text-tertiary capitalize">
            {result.metadata.statusCategory.replace('_', ' ')}
          </span>
        )}
          {badge.label}
        </span>
      </div>
    </m.button>
  );
}
