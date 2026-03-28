export function saveTempImage(data: Uint8Array, mimeType: string) {
  return window.api.tempImages.save(data, mimeType);
}

export function deleteTempImage(path: string) {
  return window.api.tempImages.delete(path);
}
