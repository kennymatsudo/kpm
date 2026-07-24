import type { PlanAction, Repo } from '../../../../shared/types';
import { RepositoryScopeEditor } from '../RepositoryScopeEditor';

interface RepositoryScopeDetailProps {
  action: Extract<PlanAction, { type: 'set_repo_targets' }>;
  repos: Repo[];
  onChange: (action: Extract<PlanAction, { type: 'set_repo_targets' }>) => void;
}

export function RepositoryScopeDetail({ action, repos, onChange }: RepositoryScopeDetailProps) {
  return (
    <div className="space-y-3">
      <span className="inline-flex text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-accent/12 text-accent">
        Set Repository Scope
      </span>
      <RepositoryScopeEditor
        value={action.repository_scope}
        onChange={(repositoryScope) => onChange({
          ...action,
          repository_scope: repositoryScope,
        })}
        repos={repos}
        idPrefix={`repository-scope-action-${action.item_id}`}
      />
    </div>
  );
}
