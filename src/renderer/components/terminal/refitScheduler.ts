/**
 * Debounced, self-retrying scheduler for terminal refits. Two problems, one timer.
 *
 * A drag fires a ResizeObserver callback per frame, and every refit reflows the
 * whole scrollback and SIGWINCHes the shell. A TUI repaints by moving the cursor
 * relative to where it thinks it is, so it paints onto the wrong rows when the
 * buffer reflows underneath it — the burst has to be coalesced into one refit.
 *
 * A refit can also simply fail: the container is laid out before xterm has
 * measured the font, and `proposeDimensions` needs a cell size. No further
 * ResizeObserver callback is coming unless the box changes again, so a failure
 * has to retry itself or the terminal sits at xterm's 80x24 default forever
 * while the panel renders full width.
 */

export interface RefitSchedulerOptions {
  /** Perform the refit. Returns false when the terminal could not be measured. */
  attempt: () => boolean;
  /** Whether a failed attempt is worth repeating — false while off screen. */
  canRetry: () => boolean;
  debounceMs: number;
  retryMs: number;
  maxRetries: number;
}

export interface RefitScheduler {
  /** Coalesce with any pending run, and restore the retry budget. */
  schedule: () => void;
  cancel: () => void;
}

export function createRefitScheduler(options: RefitSchedulerOptions): RefitScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retriesLeft = 0;

  const run = () => {
    timer = undefined;
    if (options.attempt()) return;
    if (retriesLeft <= 0 || !options.canRetry()) return;
    retriesLeft -= 1;
    timer = setTimeout(run, options.retryMs);
  };

  return {
    schedule: () => {
      retriesLeft = options.maxRetries;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, options.debounceMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
