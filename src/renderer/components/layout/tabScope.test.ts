import { describe, expect, it } from 'vitest';
import { createTabScopeTracker, itemAtPosition, TAB_SCOPE_ATTRIBUTE } from './tabScope';

function region(scope: string) {
  const element = {
    isConnected: true,
    getAttribute: (name: string) => (name === TAB_SCOPE_ATTRIBUTE ? scope : null),
  };
  return element;
}

function targetInside(regionElement: ReturnType<typeof region> | null) {
  return { closest: () => regionElement } as unknown as EventTarget;
}

describe('createTabScopeTracker', () => {
  it('starts on the main views', () => {
    expect(createTabScopeTracker().current()).toBe('main-view');
  });

  it('follows the region of the last click or focus', () => {
    const tracker = createTabScopeTracker();
    tracker.note(targetInside(region('chat')));
    expect(tracker.current()).toBe('chat');
    tracker.note(targetInside(region('documents')));
    expect(tracker.current()).toBe('documents');
  });

  it('returns to the main views after a click outside every region', () => {
    const tracker = createTabScopeTracker();
    tracker.note(targetInside(region('chat')));
    tracker.note(targetInside(null));
    expect(tracker.current()).toBe('main-view');
  });

  it('falls back to the main views once the region has unmounted', () => {
    const tracker = createTabScopeTracker();
    const documents = region('documents');
    tracker.note(targetInside(documents));
    documents.isConnected = false;
    expect(tracker.current()).toBe('main-view');
  });

  it('ignores a region with an unknown scope name', () => {
    const tracker = createTabScopeTracker();
    tracker.note(targetInside(region('sidebar')));
    expect(tracker.current()).toBe('main-view');
  });
});

describe('itemAtPosition', () => {
  it('counts from 1 and treats 9 as the last tab', () => {
    const tabs = ['a', 'b', 'c'];
    expect(itemAtPosition(tabs, 1)).toBe('a');
    expect(itemAtPosition(tabs, 3)).toBe('c');
    expect(itemAtPosition(tabs, 4)).toBeUndefined();
    expect(itemAtPosition(tabs, 9)).toBe('c');
  });
});
