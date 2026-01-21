/**
 * Focused resource formatting for prompts.
 */


/**
 */
export function formatFocusedResource(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return `"${resource.title}" (plan item id: ${resource.id})`;
    case 'project_file':
      return resource.path;
    case 'repo':
      return resource.path ?? resource.id;
    case 'document':
      return resource.path;
  }
}

/**
 * Build the focused resources section for system prompts.
 */
  if (focusedResources.length === 0) return '';

  return `

`;
}
