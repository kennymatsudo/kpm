import { describe, expect, it } from 'vitest';
import { jiraAdfCodec } from './jira-adf';

describe('jiraAdfCodec', () => {
  it('converts a realistic ADF document from Atlassian into readable markdown', () => {
    const adf = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Rollout Plan' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ship ' },
            { type: 'text', text: 'phase 1', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' to ' },
            { type: 'text', text: 'Linear', marks: [{ type: 'link', attrs: { href: 'https://linear.app' } }] },
          ],
        },
        {
          type: 'panel',
          attrs: { panelType: 'info' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Coordinate support handoff before enabling sync.' }],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Validate import flow' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Announce migration timing' }],
                },
              ],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'bash' },
          content: [{ type: 'text', text: 'npm run typecheck' }],
        },
      ],
    };

    expect(jiraAdfCodec.fromExternal(adf)).toBe(
      [
        '## Rollout Plan',
        '',
        'Ship **phase 1** to [Linear](https://linear.app)',
        '',
        '> **INFO**',
        '>',
        '> Coordinate support handoff before enabling sync.',
        '',
        '- Validate import flow',
        '- Announce migration timing',
        '',
        '```bash',
        'npm run typecheck',
        '```',
      ].join('\n')
    );
  });

  it('converts markdown back into an ADF document', () => {
    const adf = jiraAdfCodec.toExternal(
      '# Launch Checklist\n\n- Confirm owner\n- Post status update\n\n```ts\nconst ready = true;\n```'
    ) as { type: string; content: { type: string }[] } | null;

    expect(adf).not.toBeNull();
    expect(adf?.type).toBe('doc');
    expect(adf?.content.map((node) => node.type)).toEqual(['heading', 'bulletList', 'codeBlock']);
  });
});
