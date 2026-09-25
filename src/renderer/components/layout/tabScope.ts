/**
 * Cmd+1..9 picks a tab in whichever tab strip the user last worked in: the
 * chat sessions, the open documents, or (anywhere else) the main views.
 *
 * A region opts in by carrying `data-tab-scope` on its root element. The
 * tracker remembers the region element itself rather than its name, so a
 * region that has since unmounted (the view switched, the last document
 * closed) falls back to the main views instead of steering keys at tabs the
 * user can no longer see.
 */

export type TabScope = 'main-view' | 'chat' | 'documents';

export const TAB_SCOPE_ATTRIBUTE = 'data-tab-scope';

const SCOPED_REGIONS = new Set<string>(['chat', 'documents']);

interface RegionElement {
  readonly isConnected: boolean;
  getAttribute(name: string): string | null;
}

interface InteractionTarget {
  closest(selector: string): RegionElement | null;
}

function isInteractionTarget(target: unknown): target is InteractionTarget {
  return typeof (target as InteractionTarget | null)?.closest === 'function';
}

export interface TabScopeTracker {
  /** Record a click or focus; a target outside every region resets to the main views. */
  note(target: EventTarget | null): void;
  current(): TabScope;
}

export function createTabScopeTracker(): TabScopeTracker {
  let region: RegionElement | null = null;

  return {
    note(target) {
      region = isInteractionTarget(target) ? target.closest(`[${TAB_SCOPE_ATTRIBUTE}]`) : null;
    },
    current() {
      if (!region?.isConnected) return 'main-view';
      const scope = region.getAttribute(TAB_SCOPE_ATTRIBUTE);
      return scope && SCOPED_REGIONS.has(scope) ? (scope as TabScope) : 'main-view';
    },
  };
}

/**
 * The item a Cmd+digit position names. 9 is always the last tab, as in
 * browsers, so the far end of a long strip is one key away.
 */
export function itemAtPosition<T>(items: readonly T[], position: number): T | undefined {
  if (position === 9) return items[items.length - 1];
  return items[position - 1];
}
