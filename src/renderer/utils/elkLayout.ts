import { AUTO_LAYOUT, CARD_WIDTHS } from '../constants/layout';


export interface MacroLayoutInputItem {
  id: string;
  width: number;
  height: number;
}

export interface MacroLayoutResult {
  positions: { id: string; x: number; y: number }[];
  bounds: { width: number; height: number };
}

export async function computeMacroLayoutWithElk(
  items: MacroLayoutInputItem[],
  availableWidth: number,
): Promise<MacroLayoutResult> {
  if (items.length === 0) {
    return { positions: [], bounds: { width: 0, height: 0 } };
  }

  const aspectRatio = availableWidth > 0 ? availableWidth / 800 : 1.6;

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.box.packingMode': 'SIMPLE',
      'elk.aspectRatio': String(aspectRatio),
      'elk.spacing.nodeNode': String(AUTO_LAYOUT.HORIZONTAL_GAP),
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: items.map((item) => ({
      id: item.id,
      width: item.width,
      height: item.height,
    })),
  };

  const laidOut = await elk.layout(graph);

  const positions: { id: string; x: number; y: number }[] = [];
  let maxX = 0;
  let maxY = 0;

  for (const child of laidOut.children ?? []) {
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    const w = child.width ?? CARD_WIDTHS[0];
    const h = child.height ?? 0;
    positions.push({ id: child.id, x, y });
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  return { positions, bounds: { width: maxX, height: maxY } };
}
