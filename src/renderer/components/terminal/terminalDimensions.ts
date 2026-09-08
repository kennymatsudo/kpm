interface TerminalDimensions {
  cols: number;
  rows: number;
}

const MIN_COLUMNS = 20;
const MIN_ROWS = 3;

/** Keeps transient display-loss measurements from reflowing the PTY buffer. */
export function canResizeTerminal(
  dimensions: TerminalDimensions | undefined,
  isDocumentVisible: boolean,
): dimensions is TerminalDimensions {
  return Boolean(
    isDocumentVisible &&
      dimensions &&
      dimensions.cols >= MIN_COLUMNS &&
      dimensions.rows >= MIN_ROWS,
  );
}
