/**
 * Splits markdown text into blank-line-delimited blocks so a streaming
 * renderer can memoize each block independently instead of re-parsing the
 * full accumulated string on every buffer flush.
 */

const FENCE_OPEN_PATTERN = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_PATTERN = /^\s*(`{3,}|~{3,})\s*$/;

/**
 * Split markdown text into blocks on blank-line boundaries. A fenced code
 * block (``` or ~~~) is treated as atomic — blank lines inside an open fence
 * never split, and an unterminated trailing fence absorbs the rest of the
 * text into its block.
 */
export function splitMarkdownBlocks(text: string): string[] {
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    blocks.push(current.join('\n'));
    current = [];
  };

  for (const line of lines) {
    if (inFence) {
      current.push(line);
      const closeMatch = FENCE_CLOSE_PATTERN.exec(line);
      if (closeMatch?.[1].startsWith(fenceChar) && closeMatch[1].length >= fenceLen) {
        inFence = false;
      }
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    current.push(line);

    const openMatch = FENCE_OPEN_PATTERN.exec(line);
    if (openMatch) {
      inFence = true;
      fenceChar = openMatch[1][0];
      fenceLen = openMatch[1].length;
    }
  }

  flush();
  return blocks;
}
