/** Files the HTML preview window renders as a page rather than as source. */
export function isPreviewableHtmlPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}
