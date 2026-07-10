import { describe, it, expect } from 'vitest';
import { sanitizeSessionTitle } from './StreamingSessionService';

/**
 * sendChatMessage prepends a `[Context: …]` view hint to the user's first turn,
 * which the SDK then echoes into its auto-summary. sanitizeSessionTitle strips
 * that marker so the tab shows intent, not context.
 */
describe('sanitizeSessionTitle', () => {
  it('strips a leading [Context: …] view hint', () => {
    const summary = '[Context: user is viewing the planning canvas] Add a plan item field';
    expect(sanitizeSessionTitle(summary, 'Add a plan item field')).toBe('Add a plan item field');
  });

  it('falls back to the raw seed when only the context hint remains', () => {
    const summary = '[Context: user is viewing the workspace]';
    expect(sanitizeSessionTitle(summary, 'How do I wire the poller?')).toBe('How do I wire the poller?');
  });

  it('returns null when nothing survives and there is no seed', () => {
    expect(sanitizeSessionTitle('[Context: user is viewing the workspace]')).toBeNull();
  });

  it('still routes a Focused Selection summary to the seed after stripping context', () => {
    const summary = '[Context: user is viewing the planning canvas] # Focused Selection of three items';
    expect(sanitizeSessionTitle(summary, 'Review these tasks')).toBe('Review these tasks');
  });

  it('passes an ordinary summary through untouched', () => {
    expect(sanitizeSessionTitle('Refactor the streaming service', 'seed')).toBe(
      'Refactor the streaming service'
    );
  });
});
