export interface BoundedOutputBuffer {
  append(chunk: string): void;
  read(): string;
  readonly length: number;
}

export function createBoundedOutputBuffer(maxLength: number): BoundedOutputBuffer {
  const chunks: string[] = [];
  let totalLength = 0;
  let joined: string | null = '';

  function append(chunk: string): void {
    joined = null;
    if (maxLength <= 0) return;

    chunks.push(chunk);
    totalLength += chunk.length;

    while (totalLength > maxLength) {
      const head = chunks[0];
      if (totalLength - head.length >= maxLength) {
        chunks.shift();
        totalLength -= head.length;
      } else {
        const overflow = totalLength - maxLength;
        chunks[0] = head.slice(overflow);
        totalLength -= overflow;
        break;
      }
    }
  }

  function read(): string {
    if (joined === null) {
      joined = chunks.join('');
    }
    return joined;
  }

  return {
    append,
    read,
    get length() {
      return totalLength;
    },
  };
}
