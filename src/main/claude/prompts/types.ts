/**
 * Types for Claude prompt context.
 */


export interface PlanContext {
  project: Project;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  focusedResources: FocusedResource[];
}
