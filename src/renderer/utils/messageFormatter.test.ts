import { describe, expect, it } from 'vitest';
import { parseUserMessage, processMessageContent } from './messageFormatter';

describe('processMessageContent', () => {
  it('strips a json:plan block and flags the message as a plan update', () => {
    const content = 'Here is the update.\n\n```json:plan\n{"foo":"bar"}\n```';

    expect(processMessageContent(content)).toEqual({
      displayContent: 'Here is the update.',
      hasPlanUpdate: true,
    });
  });

  it('strips a plan-actions block and flags the message as a plan update', () => {
    const content = '```plan-actions\n[{"type":"update_item"}]\n```\n\nDone.';

    expect(processMessageContent(content)).toEqual({
      displayContent: 'Done.',
      hasPlanUpdate: true,
    });
  });

  it('strips every plan block when both kinds appear in the same message', () => {
    const content = 'Intro\n\n```json:plan\n{"a":1}\n```\n\nMiddle\n\n```plan-actions\n[]\n```\n\nOutro';

    expect(processMessageContent(content)).toEqual({
      displayContent: 'Intro\n\n\n\nMiddle\n\n\n\nOutro',
      hasPlanUpdate: true,
    });
  });

  it('passes plain prose through unchanged and reports no plan update', () => {
    const content = 'Just a regular chat message, no plan blocks here.';

    expect(processMessageContent(content)).toEqual({
      displayContent: content,
      hasPlanUpdate: false,
    });
  });
});

describe('parseUserMessage', () => {
  it('strips the image prefix and counts attachments, passing through when absent', () => {
    const withImages = 'Images attached (use Read tool to view):\n- screenshot.png\n- diagram.png\n\nWhat do you see here?';

    expect(parseUserMessage(withImages)).toEqual({
      cleanContent: 'What do you see here?',
      imageCount: 2,
    });

    expect(parseUserMessage('Plain message with no images')).toEqual({
      cleanContent: 'Plain message with no images',
      imageCount: 0,
    });
  });
});
