  // Migrate retired views (documents, development) to workspace.
  if (saved === 'documents' || saved === 'development') {
  return saved === 'workspace' || saved === 'planning' ? saved : 'workspace';
