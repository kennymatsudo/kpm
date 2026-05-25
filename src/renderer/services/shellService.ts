export function openExternalUrl(url: string): void {
  void window.api.shell.openExternal(url);
}
