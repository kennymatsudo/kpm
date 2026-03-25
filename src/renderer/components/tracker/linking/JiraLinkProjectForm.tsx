import { JiraProjectSelector } from '../config/JiraProjectSelector';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { getIssueTypeStyle } from '../shared/issueTypeConfig';
import { useJiraAssociationLinking } from '../../../hooks/useJiraAssociationLinking';

interface Props {
  projectId: string | null;
  siteUrl: string;
  onLinked: () => void;
  onCancel: () => void;
  variant: 'dialog' | 'panel';
}

const FILTER_PRESETS = [
  {
    id: 'all' as const,
    label: 'All Issues',
    description: 'Import all issues from the project',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: 'epic' as const,
    label: 'By Epic',
    description: 'Import a specific epic and its children',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'custom' as const,
    label: 'Custom JQL',
    description: 'Write your own JQL query',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
];

const VARIANT_STYLES = {
  dialog: {
    presetActive: 'bg-info/10 ring-1 ring-info/30',
    presetIconActive: 'bg-info/20 text-info',
    issueActive: 'bg-info/15 ring-1 ring-info/30',
    relationshipActive: 'bg-info/10 ring-1 ring-info/25',
    radioActive: 'border-info bg-info',
    previewBox: 'bg-info-muted border border-info/20',
    previewLabel: 'text-info',
    buttonEnabled: 'bg-info text-white hover:bg-info hover:shadow-lg hover:shadow-info/25 active:scale-[0.98] cursor-pointer',
    buttonDisabled: 'bg-surface-2 text-text-muted cursor-not-allowed',
    input:
      'w-full px-4 py-2.5 bg-surface-2 border border-border-default rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-info/50 focus:bg-surface-1 transition-all duration-150',
    searchInput:
      'w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-border-default rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-info/50 focus:bg-surface-1 transition-all duration-150',
    textArea:
      'w-full px-4 py-3 bg-surface-2 border border-border-default rounded-xl text-text-primary placeholder-text-muted text-sm font-mono focus:outline-none focus:border-info/50 focus:bg-surface-1 transition-all duration-150 resize-none',
    secondaryAction:
      'px-5 py-2.5 text-sm font-medium text-text-secondary bg-surface-2 rounded-xl hover:bg-surface-3 hover:text-text-primary active:scale-[0.98] transition-all duration-150 cursor-pointer',
    primaryAction: 'px-5 py-2.5 text-sm font-medium rounded-xl transition-all duration-150 flex items-center gap-2',
    footer: 'dialog-footer px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t border-border-default',
    spinnerColor: 'info' as const,
  },
  panel: {
    presetActive: 'bg-accent-subtle ring-1 ring-accent/30',
    presetIconActive: 'bg-accent-muted text-accent',
    issueActive: 'bg-accent-subtle ring-1 ring-accent/30',
    relationshipActive: 'bg-accent-subtle ring-1 ring-accent/25',
    radioActive: 'border-accent bg-accent',
    previewBox: 'bg-accent-subtle border border-accent/20',
    previewLabel: 'text-accent',
    input: 'input',
    searchInput: 'w-full pl-10 pr-4 py-2 input',
    textArea: 'w-full px-3 py-2 input font-mono text-sm resize-none',
    buttonEnabled: '',
    buttonDisabled: '',
    secondaryAction: 'btn btn-secondary',
    primaryAction: 'btn btn-primary',
    footer: 'flex items-center gap-3 pt-2',
    spinnerColor: 'accent' as const,
  },
} as const;

export function JiraLinkProjectForm({
  projectId,
  siteUrl,
  onLinked,
  onCancel,
  variant,
}: Props) {
  const styles = VARIANT_STYLES[variant];
  const {
    projects,
    isLoadingProjects,
    projectError,
    loadProjects,
    selectedProject,
    filterPreset,
    issueSearchQuery,
    issues,
    isLoadingIssues,
    issuesError,
    selectedIssue,
    issueRelationship,
    childIssues,
    isLoadingChildren,
    childrenError,
    customJql,
    displayName,
    isLinking,
    error,
    currentJql,
    canLink,
    setIssueSearchQuery,
    setIssueRelationship,
    setCustomJql,
    setDisplayName,
    selectProject,
    selectFilterPreset,
    selectIssue,
    handleLink,
  } = useJiraAssociationLinking({
    projectId,
    siteUrl,
    onLinked,
  });

  return (
    <>
      <div className="space-y-5">
        <JiraProjectSelector
          projects={projects}
          selectedProject={selectedProject}
          onSelect={selectProject}
          isLoading={isLoadingProjects}
          error={projectError}
          onRetry={() => loadProjects(true)}
        />

        {selectedProject && (
          <>
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                What would you like to import?
              </label>
              <div className="space-y-2">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => selectFilterPreset(preset.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-150 cursor-pointer text-left w-full ${
                      filterPreset === preset.id ? styles.presetActive : 'bg-surface-2 hover:bg-surface-3'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        filterPreset === preset.id ? styles.presetIconActive : 'bg-surface-3 text-text-muted'
                      }`}
                    >
                      {preset.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          filterPreset === preset.id ? 'text-text-primary' : 'text-text-secondary'
                        }`}
                      >
                        {preset.label}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{preset.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {filterPreset === 'epic' && (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">
                  Select an epic to import. You can link just the epic or include its child issues.
                </p>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={issueSearchQuery}
                    onChange={(e) => setIssueSearchQuery(e.target.value)}
                    placeholder="Search epics by key or title..."
                    className={styles.searchInput}
                  />
                </div>

                <div className="max-h-48 overflow-y-auto rounded-xl bg-surface-2 border border-border-default">
                  {isLoadingIssues ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner className="w-5 h-5" color={styles.spinnerColor} />
                    </div>
                  ) : issuesError ? (
                    <div className="text-sm p-4 text-danger">{issuesError}</div>
                  ) : issues.length === 0 ? (
                    <p className="text-text-muted text-sm text-center py-8">
                      {issueSearchQuery ? 'No epics found' : 'No recent epics'}
                    </p>
                  ) : (
                    <div className="p-1">
                      {issues.map((issue) => {
                        const typeStyle = getIssueTypeStyle(issue.issueType);
                        const isSelected = selectedIssue?.key === issue.key;
                        return (
                          <button
                            key={issue.key}
                            onClick={() => selectIssue(issue)}
                            className={`w-full text-left p-3 rounded-lg transition-all duration-150 cursor-pointer ${
                              isSelected ? styles.issueActive : 'hover:bg-surface-3'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-6 h-6 rounded-md ${typeStyle.bg} ${typeStyle.text} flex items-center justify-center flex-shrink-0`}
                              >
                                {typeStyle.icon}
                              </div>
                              <span className="font-mono text-sm text-text-secondary">{issue.key}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
                                {issue.issueType}
                              </span>
                            </div>
                            <p className="text-sm text-text-primary mt-1.5 truncate pl-[34px]">
                              {issue.title}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedIssue && (
                  <div>
                    <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                      Import
                    </label>
                    <div className="space-y-1.5">
                      {[
                        {
                          value: 'self' as const,
                          label: 'This issue only',
                          jql: `key = ${selectedIssue.key}`,
                        },
                        {
                          value: 'children' as const,
                          label: 'Children of this issue',
                          jql: `parent = ${selectedIssue.key}`,
                        },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                            issueRelationship === option.value
                              ? styles.relationshipActive
                              : 'bg-surface-2 hover:bg-surface-3'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
                              issueRelationship === option.value ? styles.radioActive : 'border-text-muted'
                            }`}
                          >
                            {issueRelationship === option.value && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </div>
                          <input
                            type="radio"
                            name="relationship"
                            checked={issueRelationship === option.value}
                            onChange={() => setIssueRelationship(option.value)}
                            className="sr-only"
                          />
                          <div className="flex-1">
                            <span className="text-sm text-text-primary font-medium">{option.label}</span>
                            <p className="text-xs text-text-muted font-mono mt-0.5">{option.jql}</p>
                          </div>
                          {option.value === 'children' && issueRelationship === 'children' && (
                            <span className="text-xs text-text-muted">
                              {isLoadingChildren ? '...' : `${childIssues.length} issues`}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>

                    {issueRelationship === 'children' && (
                      <div className="mt-3">
                        {isLoadingChildren ? (
                          <div className="flex items-center justify-center py-4">
                            <LoadingSpinner className="w-4 h-4" color={styles.spinnerColor} />
                          </div>
                        ) : childrenError ? (
                          <p className="text-xs text-danger">{childrenError}</p>
                        ) : childIssues.length === 0 ? (
                          <p className="text-xs text-text-muted text-center py-3">No child issues found</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto rounded-lg bg-surface-2 border border-border-default">
                            <div className="p-1.5 space-y-0.5">
                              {childIssues.map((child) => {
                                const typeStyle = getIssueTypeStyle(child.issueType);
                                return (
                                  <div key={child.key} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs">
                                    <div
                                      className={`w-5 h-5 rounded ${typeStyle.bg} ${typeStyle.text} flex items-center justify-center flex-shrink-0`}
                                    >
                                      {typeStyle.icon}
                                    </div>
                                    <span className="font-mono text-text-secondary flex-shrink-0">{child.key}</span>
                                    <span className="text-text-primary truncate">{child.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {filterPreset === 'custom' && (
              <div>
                <textarea
                  value={customJql}
                  onChange={(e) => setCustomJql(e.target.value)}
                  placeholder={`project = ${selectedProject.key} AND ...`}
                  rows={variant === 'dialog' ? 4 : 3}
                  className={styles.textArea}
                />
                <p className="text-text-muted text-xs mt-2">Enter any valid JQL query</p>
              </div>
            )}

            {currentJql && filterPreset !== 'all' && (
              <div className={`p-4 rounded-xl ${styles.previewBox}`}>
                <p className={`text-xs uppercase tracking-wider mb-1.5 ${styles.previewLabel}`}>
                  JQL Preview
                </p>
                <code className="text-sm text-text-primary font-mono break-all leading-relaxed">
                  {currentJql}
                </code>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                Display Name <span className="text-text-tertiary normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={styles.input}
              />
            </div>
          </>
        )}

        {error && (
          <div className="text-sm p-4 rounded-xl bg-danger-muted text-danger border border-danger/20 flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button onClick={onCancel} className={styles.secondaryAction}>
          Cancel
        </button>
        {variant === 'panel' && <div className="flex-1" />}
        <button
          onClick={handleLink}
          disabled={!canLink || isLinking}
          className={
            variant === 'dialog'
              ? `${styles.primaryAction} ${
                  canLink && !isLinking ? styles.buttonEnabled : styles.buttonDisabled
                }`
              : styles.primaryAction
          }
        >
          {isLinking ? (
            <>
              <LoadingSpinner className="w-4 h-4" color={variant === 'dialog' ? 'white' : undefined} />
              Linking...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Link Project
            </>
          )}
        </button>
      </div>
    </>
  );
}
