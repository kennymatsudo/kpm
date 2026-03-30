import { DirectoryAutocomplete } from './DirectoryAutocomplete';

function basename(p: string): string {
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

interface StepScopeFeatureProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
  repoPaths: string[];
  repoDirectories: Record<string, string[]>;
  onRepoDirectoriesChange: (dirs: Record<string, string[]>) => void;
}

export function StepScopeFeature({
  description,
  onDescriptionChange,
  repoPaths,
  repoDirectories,
  onRepoDirectoriesChange,
}: StepScopeFeatureProps) {
  const handleDirectoryChange = (repoPath: string, dirs: string[]) => {
    onRepoDirectoriesChange({
      ...repoDirectories,
      [repoPath]: dirs,
    });
  };

  return (
      {/* Optional description */}
      <div className="space-y-2">
        <label
          htmlFor="project-description"
          className="block text-xs font-medium text-text-secondary uppercase tracking-wide"
        >
          Additional context
          <span className="text-text-tertiary normal-case ml-1">(optional)</span>
        </label>
        <textarea
          id="project-description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="Any context the AI can't infer from code, e.g. external integrations, migration goals..."
          rows={3}
          className="input input-bordered resize-none"
        />
      </div>

      {/* Per-repo directory scoping */}
      {repoPaths.length > 0 && (
        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Feature directories
            </span>
            <p className="text-xs text-text-muted mt-0.5">
              Specify which directories within each repo this feature lives in.
            </p>
          </div>

          <div className="space-y-4 pr-1">
            {repoPaths.map(repoPath => (
              <DirectoryAutocomplete
                key={repoPath}
                repoPath={repoPath}
                repoName={basename(repoPath)}
                directories={repoDirectories[repoPath] ?? []}
                onDirectoriesChange={dirs => handleDirectoryChange(repoPath, dirs)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
