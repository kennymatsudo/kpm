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

  const isSingle = focusedResources.length === 1;
  const resource = focusedResources[0];

  // Build a natural-language description of what's focused
  let focusDescription: string;
  if (isSingle) {
    focusDescription = `The user has selected ${describeFocusedResource(resource)}. When they say "this", "this file", "the file", "it", or refer to something without specifying what, they mean this resource.`;
  } else {
    focusDescription = `The user has selected the following ${focusedResources.length} resources. When they say "these", "these files", "the files", "them", or refer to something without specifying what, they mean these resources. When they say "this file" or "this" singularly, ask which one they mean — or infer from context if obvious.`;
  }

  return `

${focusDescription}

Treat these as the implicit subject of the conversation unless the user explicitly names something else.
`;
}

/**
 * Describe a focused resource in natural language for the prompt preamble.
 */
function describeFocusedResource(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return `a plan item: "${resource.title}"`;
    case 'project_file':
      return resource.isDirectory
        ? `a directory: ${resource.path}`
        : `a file: ${resource.path}`;
    case 'repo':
      return `a repository: ${resource.path ?? resource.id}`;
    case 'document':
      return `a document: "${resource.title}"`;
  }
}
