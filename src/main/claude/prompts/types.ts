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
  /** Custom task prompt template - if set, overrides default PLAN_STRUCTURE */
  taskPromptTemplate?: TaskPromptTemplate | null;
}
