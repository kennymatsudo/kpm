/**
 * Drag source identifiers for drag-and-drop operations.
 * Used to identify where a dragged item originated from.
 */
export const DragSource = {
  CANVAS: 'canvas',
} as const;

export type DragSourceType = typeof DragSource[keyof typeof DragSource];
