import { describe, expect, it } from 'vitest';
import { sharedLeadingPrefix, stripSharedPrefix } from './sessionTabLabels';

describe('sharedLeadingPrefix', () => {
  it('finds nothing to remove when the labels start differently', () => {
    expect(sharedLeadingPrefix([
      'Explain the export boundary and where it is enforced',
      'Why does the board poller restart a busy session',
    ])).toBe('');
  });

  it('cuts the shared opening back to the last word break', () => {
    // The characters in common run into the middle of "this"/"the".
    expect(sharedLeadingPrefix([
      'Read this spec. Propose a better design for the panel',
      'Read the spec. Are there any gaps in the acceptance criteria',
    ])).toBe('Read ');
  });

  it('keeps the whole shared opening when it already ends on a break', () => {
    expect(sharedLeadingPrefix([
      'Review the migration and tell me what it changes',
      'Review the migration and say whether it is reversible',
    ])).toBe('Review the migration and ');
  });

  it('removes nothing from labels that are identical', () => {
    const prompt = 'Summarize the review findings';
    expect(sharedLeadingPrefix([prompt, prompt])).toBe('');
  });

  it('removes nothing from a single tab', () => {
    expect(sharedLeadingPrefix(['Read the spec and propose a design'])).toBe('');
    expect(sharedLeadingPrefix([])).toBe('');
  });

  it('removes nothing when a label would be left too short to read', () => {
    // "Check the deploy" keeps only "deploy" once the opening goes.
    expect(sharedLeadingPrefix([
      'Check the deploy',
      'Check the deploy logs for the failed release job',
    ])).toBe('');
  });

  it('does not strip a partial first word', () => {
    // "Deploy" is shared but there is no word break inside it to cut back to.
    expect(sharedLeadingPrefix(['Deploying now', 'Deployment plan review please'])).toBe('');
  });
});

describe('stripSharedPrefix', () => {
  it('leaves the label alone when there is no prefix', () => {
    expect(stripSharedPrefix('Read the spec', '')).toBe('Read the spec');
  });

  it('leaves a label that does not carry the prefix alone', () => {
    expect(stripSharedPrefix('Write the migration', 'Read ')).toBe('Write the migration');
  });

  it('removes the prefix and the break that followed it', () => {
    expect(stripSharedPrefix('Read the spec', 'Read ')).toBe('the spec');
  });
});
