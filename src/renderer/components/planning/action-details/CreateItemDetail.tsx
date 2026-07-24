/**
 * CreateItemDetail - Detail view for create_item actions.
 * Shows preview of the new item being created.
 */

import { Markdown } from 'markdown-to-jsx';
import type { PlanAction, PlanItem, Repo } from '../../../../shared/types';
import { markdownOptions, transformPlanRefs } from '../../../utils/markdown';
import { RepositoryScopeEditor } from '../RepositoryScopeEditor';

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
  const repositoryScope = {
    primary_repo_id: action.primary_repo_id ?? null,
    affected_repo_ids: action.affected_repo_ids ?? [],
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

      {/* Work Brief */}
      <div className="space-y-2">
        <div>
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Intent</div>
          <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle text-xs text-text-secondary">
            {action.intent || <span className="text-text-tertiary italic">No intent</span>}
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Context</div>
          <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle max-h-[40vh] overflow-y-auto">
            {action.description ? (
              <div className="prose text-xs">
                <Markdown options={markdownOptions}>{transformPlanRefs(action.description)}</Markdown>
              </div>
            ) : (
              <span className="text-xs text-text-tertiary italic">No context</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Acceptance Criteria</div>
          <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle">
            {action.acceptance_criteria && action.acceptance_criteria.length > 0 ? (
              <ul className="space-y-1 text-xs text-text-secondary">
                {action.acceptance_criteria.map((criterion, index) => (
                  <li key={`${criterion}-${index}`}>{criterion}</li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-text-tertiary italic">No acceptance criteria</span>
            )}
          </div>
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

      <RepositoryScopeEditor
        value={repositoryScope}
        onChange={(scope) => onRepoTargetsChange({
          primaryRepoId: scope.primary_repo_id,
          affectedRepoIds: scope.affected_repo_ids,
        })}
        repos={repos}
        idPrefix="create-action-repository-scope"
      />
    </div>
  );
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
