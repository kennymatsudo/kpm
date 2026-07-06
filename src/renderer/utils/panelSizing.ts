import type { PanelSizeConfig } from '../constants/layout';

interface ViewportBoundedMaxOptions {
  min: number;
  hardMax: number;
  viewportFraction: number;
  reservedWidth?: number;
  remainingMinWidth?: number;
  viewportWidth?: number;
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
  viewportWidth,
}: ViewportBoundedMaxOptions): number {
  const resolvedViewportWidth =
    viewportWidth ?? (typeof window === 'undefined' ? undefined : window.innerWidth);
  if (resolvedViewportWidth === undefined) return hardMax;

  const viewportMax = resolvedViewportWidth * viewportFraction;
  const remainingSpaceMax =
    remainingMinWidth > 0
      ? resolvedViewportWidth - reservedWidth - remainingMinWidth
      : Number.POSITIVE_INFINITY;

  return Math.max(min, Math.min(viewportMax, remainingSpaceMax, hardMax));
}

interface ResolvePanelMaxOptions {
  viewportWidth: number;
  reservedWidth?: number;
}

export function resolvePanelMax(
  config: PanelSizeConfig,
  { viewportWidth, reservedWidth = 0 }: ResolvePanelMaxOptions
): number {
  if (config.viewportFraction === undefined) return config.maxAbs;

  return getViewportBoundedMax({
    min: config.min,
    hardMax: config.maxAbs,
    viewportFraction: config.viewportFraction,
    reservedWidth,
    remainingMinWidth: config.remainingMinWidth,
    viewportWidth,
  });
}
