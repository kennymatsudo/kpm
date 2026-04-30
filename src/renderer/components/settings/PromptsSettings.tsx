/**
 * Prompts Settings Component
 *
 * Consolidated settings UI for all prompt types.
 */

import { usePromptOverrideStore, type PromptSubTab } from '../../stores/promptOverrideStore';
import { PromptEditorSettings } from './PromptEditorSettings';
import { TaskPromptSettings } from './TaskPromptSettings';

interface Props {
  currentProjectId?: string | null;
}

const SUB_TABS: { id: PromptSubTab; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'generation', label: 'Generation' },
  { id: 'taskCreation', label: 'Task Creation' },
  { id: 'agents', label: 'Board Agents' },
];

export function PromptsSettings({ currentProjectId }: Props) {
  const activeCategory = usePromptOverrideStore((s) => s.activeCategory);
  const setCategory = usePromptOverrideStore((s) => s.setCategory);

  return (
      {/* Sticky header + sub-tabs */}
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-subtle">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">Prompts</h3>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 border-b border-border -mx-5 px-5">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-t transition-colors
                ${activeCategory === tab.id
                  ? 'text-accent bg-surface-elevated border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-secondary'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

        {(activeCategory === 'system'
          || activeCategory === 'generation'
          || activeCategory === 'agents') && (
          <PromptEditorSettings />
        )}
        {activeCategory === 'taskCreation' && (
          currentProjectId ? (
            <TaskPromptSettings currentProjectId={currentProjectId} />
          ) : (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              Open a project to configure task prompts
            </div>
          )
        )}
      </div>
    </div>
  );
}
