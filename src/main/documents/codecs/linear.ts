import type { DocumentCodec } from '../types';
import { normalizeMarkdown } from '../markdown';

export const linearMarkdownCodec: DocumentCodec<string> = {
  fromExternal(value) {
    return normalizeMarkdown(value);
  },

  toExternal(markdown) {
    return normalizeMarkdown(markdown);
  },
};
