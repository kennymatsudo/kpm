/**
 * Types for Claude prompt context.
 */


export interface PlanContext {
  project: Project;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  focusedResources: FocusedResource[];
  /** Current UI view - used for context-aware suggestions */
  currentView?: ChatViewMode;
}
