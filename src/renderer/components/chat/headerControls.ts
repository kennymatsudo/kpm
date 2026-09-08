/**
 * One treatment for every command in the chat header. The commands carry no
 * words so that tab titles are the only text in the bar and read as labels
 * instead of competing with them; each button names itself through its tooltip
 * and aria-label. Square at the tab's height, so the row reads as one band.
 */
export const HEADER_ICON_BUTTON =
  'flex items-center justify-center w-7 h-7 rounded-sm flex-shrink-0 ' +
  'text-text-tertiary hover:text-text-primary hover:bg-surface-3 transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-tertiary';
