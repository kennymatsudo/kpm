/**
 * CreateItemDetail - Detail view for create_item actions.
 * Shows preview of the new item being created.
 */

import { Markdown } from 'markdown-to-jsx';
import type { PlanAction, PlanItem, Repo } from '../../../../shared/types';
import { markdownOptions, transformPlanRefs } from '../../../utils/markdown';
import {
  NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select';

interface CreateItemDetailProps {
  action: Extract<PlanAction, { type: 'create_item' }>;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
  repos: Repo[];
  onRepoTargetsChange: (targets: { primaryRepoId: string | null; affectedRepoIds: string[] }) => void;
}

export function CreateItemDetail({
  action,
  planItems,
  placeholderMap,
  repos,
  onRepoTargetsChange,
}: CreateItemDetailProps) {
  const parentTitle = getParentTitle(action.parent_id, planItems, placeholderMap);
  const primaryRepoId = action.primary_repo_id ?? null;
  const affectedRepoIds = action.affected_repo_ids ?? [];
  const affectedRepoIdSet = new Set(affectedRepoIds);

  const setPrimaryRepo = (value: string) => {
    const nextPrimaryRepoId = value === NONE_VALUE ? null : value;
    onRepoTargetsChange({
      primaryRepoId: nextPrimaryRepoId,
      affectedRepoIds: affectedRepoIds.filter((repoId) => repoId !== nextPrimaryRepoId),
    });
  };

  const toggleAffectedRepo = (repoId: string) => {
    onRepoTargetsChange({
      primaryRepoId,
      affectedRepoIds: affectedRepoIdSet.has(repoId)
        ? affectedRepoIds.filter((id) => id !== repoId)
        : [...affectedRepoIds, repoId],
    });
  };

  return (
    <div className="space-y-3">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-success/12 text-success">
          New Item
        </span>
        {action.label && (
          <span className="text-xxs font-medium text-text-muted px-1.5 py-0.5 rounded bg-surface-2">
            {action.label}
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Title</div>
        <div className="px-2.5 py-2 rounded-lg bg-success/5 border border-success/20">
          <span className="text-sm text-text-primary font-medium">{action.title}</span>
        </div>
      </div>

      {/* Description */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Description</div>
        <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle max-h-[40vh] overflow-y-auto">
          {action.description ? (
            <div className="prose text-xs">
              <Markdown options={markdownOptions}>{transformPlanRefs(action.description)}</Markdown>
            </div>
          ) : (
            <span className="text-xs text-text-tertiary italic">No description</span>
          )}
        </div>
      </div>

      {/* Parent */}
      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Parent</div>
        <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle">
          {parentTitle ? (
            <span className="text-xs text-text-secondary">{parentTitle}</span>
          ) : (
            <span className="text-xs text-text-tertiary italic">Root level (no parent)</span>
          )}
        </div>
      </div>

      {/* Connected repo targets */}
      <div>
        <label className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1 block">
          Repository
        </label>
        {repos.length > 0 ? (
          <Select value={primaryRepoId ?? NONE_VALUE} onValueChange={setPrimaryRepo}>
            <SelectTrigger
              aria-label="Repository"
              className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-1 px-2.5 text-left text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <SelectValue />
              <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </SelectTrigger>
            <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
              <SelectItem value={NONE_VALUE}>
                <SelectItemText>Unassigned</SelectItemText>
              </SelectItem>
              {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  <SelectItemText>{repoName(repo.path)}</SelectItemText>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle text-xs text-text-tertiary italic">
            No repositories connected
          </div>
        )}
      </div>

      {repos.some((repo) => repo.id !== primaryRepoId) && (
        <details className="rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-2">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary">
            Also affects{affectedRepoIds.length > 0 ? ` (${affectedRepoIds.length})` : ''}
          </summary>
          <div className="mt-2 space-y-1.5">
            {repos.filter((repo) => repo.id !== primaryRepoId).map((repo) => (
              <label key={repo.id} className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={affectedRepoIdSet.has(repo.id)}
                  onChange={() => toggleAffectedRepo(repo.id)}
                  className="rounded border-border-default bg-surface-2 text-accent focus:ring-accent"
                />
                <span>{repoName(repo.path)}</span>
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function repoName(repoPath: string): string {
  return repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath;
}

function getParentTitle(
  parentId: string | null,
  planItems: PlanItem[],
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>
): string | null {
  if (!parentId) return null;

  // Check if it's a placeholder ID
  if (parentId.startsWith('$')) {
    const placeholder = placeholderMap.get(parentId);
    return placeholder?.title || `[New item ${parentId}]`;
  }

  const item = planItems.find(i => i.id === parentId);
  return item?.title || '[missing parent]';
}
