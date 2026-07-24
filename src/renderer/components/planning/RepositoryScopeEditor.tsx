import type { Repo } from '../../../shared/types';
import type { RepositoryScope } from '../../../shared/workBrief';
import {
  NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

interface RepositoryScopeEditorProps {
  value: RepositoryScope;
  onChange: (value: RepositoryScope) => void;
  repos: Repo[];
  disabled?: boolean;
  idPrefix: string;
}

export function RepositoryScopeEditor({
  value,
  onChange,
  repos,
  disabled = false,
  idPrefix,
}: RepositoryScopeEditorProps) {
  const affectedRepoIds = value.affected_repo_ids.filter(
    (repoId) => repoId !== value.primary_repo_id,
  );
  const affectedRepoIdSet = new Set(affectedRepoIds);
  const availableAffectedRepos = repos.filter((repo) => repo.id !== value.primary_repo_id);

  const setPrimaryRepo = (selectedValue: string) => {
    const primaryRepoId = selectedValue === NONE_VALUE ? null : selectedValue;
    onChange({
      primary_repo_id: primaryRepoId,
      affected_repo_ids: affectedRepoIds.filter((repoId) => repoId !== primaryRepoId),
    });
  };

  const toggleAffectedRepo = (repoId: string) => {
    onChange({
      primary_repo_id: value.primary_repo_id,
      affected_repo_ids: affectedRepoIdSet.has(repoId)
        ? affectedRepoIds.filter((affectedRepoId) => affectedRepoId !== repoId)
        : [...affectedRepoIds, repoId],
    });
  };

  return (
    <section
      className="rounded-lg border border-border-subtle bg-surface-1/50 px-4 py-3 space-y-3"
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div>
        <h3
          id={`${idPrefix}-heading`}
          className="text-xs font-medium text-text-muted uppercase tracking-wide"
        >
          Repository Scope
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Choose the main repository and any others this work may affect.
        </p>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-primary`}
          className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-1 block"
        >
          Primary repository
        </label>
        {repos.length > 0 ? (
          <Select
            value={value.primary_repo_id ?? NONE_VALUE}
            onValueChange={setPrimaryRepo}
            disabled={disabled}
          >
            <SelectTrigger
              id={`${idPrefix}-primary`}
              aria-label="Primary repository"
              className="input w-full flex items-center justify-between gap-2 py-2.5 text-sm cursor-pointer"
            >
              <SelectValue />
              <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </SelectTrigger>
            <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
              <SelectItem value={NONE_VALUE}>
                <SelectItemText>Unassigned</SelectItemText>
              </SelectItem>
              {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  <SelectItemText>{connectedRepoName(repo.path)}</SelectItemText>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="input w-full text-sm text-text-muted italic">No repositories connected</div>
        )}
      </div>

      {availableAffectedRepos.length > 0 && (
        <fieldset>
          <legend className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-1.5">
            Affected repositories
          </legend>
          <div className="space-y-1.5">
            {availableAffectedRepos.map((repo) => (
              <label
                key={repo.id}
                className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={affectedRepoIdSet.has(repo.id)}
                  onChange={() => toggleAffectedRepo(repo.id)}
                  disabled={disabled}
                  className="rounded border-border-default bg-surface-2 text-accent focus:ring-accent"
                />
                <span>{connectedRepoName(repo.path)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

export function connectedRepoName(repoPath: string): string {
  return repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath;
}
