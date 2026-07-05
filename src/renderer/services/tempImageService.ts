import type { SupportedImageFormat } from '../../shared/ipc/tempImageEndpoints';

export function saveTempImage(data: Uint8Array<ArrayBuffer>, mimeType: SupportedImageFormat) {
  return window.api.tempImages.save({ imageData: data, format: mimeType });
}

export function deleteTempImage(path: string) {
  return window.api.tempImages.delete({ filePath: path });
}
