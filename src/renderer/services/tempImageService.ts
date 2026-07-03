export function saveTempImage(data: Uint8Array, mimeType: string) {
  return window.api.tempImages.save({ imageData: data, format: mimeType });
}

export function deleteTempImage(path: string) {
  return window.api.tempImages.delete({ filePath: path });
}
