import { describe, expect, it } from 'vitest';
import { parseUserMessage } from './messageFormatter';

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
