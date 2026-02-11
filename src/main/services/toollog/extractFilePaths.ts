/**
 * Extract file paths from tool call inputs.
 *
 * Maps tool names to the input fields that contain file/directory paths.
 * Returns an empty array for tools without path information.
 */
export function extractFilePaths(
  toolName: string,
  input: Record<string, unknown>
): string[] {
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return typeof input.file_path === 'string' ? [input.file_path] : [];

    case 'Grep':
    case 'Glob':
      return typeof input.path === 'string' ? [input.path] : [];

    case 'Bash':
      // No reliable file path extraction from shell commands
      return [];

    default:
      return [];
  }
}
