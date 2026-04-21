import { adfToMarkdown } from '../../tracker-clients/jira/adf-to-markdown';
import { markdownToAdf } from '../../tracker-clients/jira/markdown-to-adf';
import { normalizeMarkdown } from '../markdown';
import type { DocumentCodec } from '../types';

export const jiraAdfCodec: DocumentCodec<unknown> = {
  fromExternal(value) {
    return adfToMarkdown(value);
  },

  toExternal(markdown) {
    const normalized = normalizeMarkdown(markdown);
    return normalized ? markdownToAdf(normalized) : null;
  },
};
