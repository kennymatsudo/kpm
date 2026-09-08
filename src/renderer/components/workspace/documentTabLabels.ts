/**
 * Tab labels for the open-document strip.
 *
 * A file name alone is the label, because that is what the user is looking for.
 * Two open documents named the same — index.ts, README.md, the same file from
 * two repos — would make the strip a row of identical tabs, so those grow just
 * enough leading path to tell them apart, and only those.
 */
export function buildTabLabels(
  documents: readonly { id: string; path: string }[]
): Map<string, string> {
  const labels = new Map<string, string>();
  const segmentsById = new Map(
    documents.map((document) => [document.id, document.path.split('/').filter(Boolean)])
  );

  let ambiguous = documents.map((document) => document.id);

  for (let depth = 1; ambiguous.length > 0; depth += 1) {
    const byLabel = new Map<string, string[]>();

    for (const id of ambiguous) {
      const segments = segmentsById.get(id) ?? [];
      const label = segments.slice(Math.max(0, segments.length - depth)).join('/') || id;
      const group = byLabel.get(label);
      if (group) group.push(id);
      else byLabel.set(label, [id]);
    }

    const stillAmbiguous: string[] = [];
    for (const [label, ids] of byLabel) {
      // Two documents can share a whole path when they come from different
      // sources. Nothing more to add, so let them share the label — the tab's
      // tooltip carries the full path.
      const exhausted = ids.every((id) => (segmentsById.get(id)?.length ?? 0) <= depth);
      if (ids.length === 1 || exhausted) {
        for (const id of ids) labels.set(id, label);
      } else {
        stillAmbiguous.push(...ids);
      }
    }

    ambiguous = stillAmbiguous;
  }

  return labels;
}
