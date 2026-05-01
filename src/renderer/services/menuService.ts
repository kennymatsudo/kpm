export function subscribeToCloseContextMenu(callback: () => void): () => void {
  return window.api.menu.onCloseContext(callback);
}
