interface ViewportBoundedMaxOptions {
  min: number;
  hardMax: number;
  viewportFraction: number;
  reservedWidth?: number;
  remainingMinWidth?: number;
}

export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

export function getViewportBoundedMax({
  min,
  hardMax,
  viewportFraction,
  reservedWidth = 0,
  remainingMinWidth = 0,
}: ViewportBoundedMaxOptions): number {
  if (typeof window === 'undefined') return hardMax;

  const viewportWidth = window.innerWidth;
  const viewportMax = viewportWidth * viewportFraction;
  const remainingSpaceMax =
    remainingMinWidth > 0
      ? viewportWidth - reservedWidth - remainingMinWidth
      : Number.POSITIVE_INFINITY;

  return Math.max(min, Math.min(viewportMax, remainingSpaceMax, hardMax));
}
