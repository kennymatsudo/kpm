/**
 * Tab labels for sessions that have no provider summary yet and fall back to
 * their first user message.
 *
 * Several sessions started from one prompt open with the same words, and a
 * tab is narrow enough that truncation keeps only the part they share — the
 * strip becomes a row of identical titles. Removing the shared opening once,
 * for the whole strip, leaves the part that actually tells them apart where
 * it survives the cut.
 */

/**
 * A stripped label shorter than this has nothing useful left to read, so the
 * whole strip keeps its full titles instead.
 */
const MIN_STRIPPED_LENGTH = 12;

/**
 * The opening every label shares, cut back to a word break so no label is left
 * starting mid-word. Returns an empty string when there is nothing worth
 * removing.
 */
export function sharedLeadingPrefix(labels: readonly string[]): string {
  if (labels.length < 2) return '';

  const first = labels[0];
  let end = first.length;
  for (let index = 1; index < labels.length; index += 1) {
    const label = labels[index];
    let matched = 0;
    while (matched < end && matched < label.length && label[matched] === first[matched]) {
      matched += 1;
    }
    end = matched;
    if (end === 0) return '';
  }

  // The break goes with the prefix, so what is left starts on a word.
  const breakIndex = first.lastIndexOf(' ', end - 1);
  if (breakIndex <= 0) return '';
  const prefix = first.slice(0, breakIndex + 1);

  // One label that is almost entirely the shared opening — a repeated prompt,
  // or a very short one — would be stripped down to nothing, so none are.
  if (labels.some((label) => label.length - prefix.length < MIN_STRIPPED_LENGTH)) return '';

  return prefix;
}

/** The label as it should read in the tab, with the shared opening removed. */
export function stripSharedPrefix(label: string, prefix: string): string {
  if (prefix.length === 0 || !label.startsWith(prefix)) return label;
  return label.slice(prefix.length);
}
