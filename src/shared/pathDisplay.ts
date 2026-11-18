/** Splits a slash-separated path into its directory (with trailing slash) and file name. */
export function splitForDisplay(path: string): { dir: string; base: string } {
  const index = path.lastIndexOf('/');
  if (index < 0) return { dir: '', base: path };
  return { dir: path.slice(0, index + 1), base: path.slice(index + 1) };
}
