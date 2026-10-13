import { memo, useMemo } from 'react';
import { Markdown } from 'markdown-to-jsx';
import {
  growingBlockMarkdownOptions,
  markdownOptions,
  useLinkedPlanRefs,
} from '../../utils/markdown';
import { splitMarkdownBlocks } from '../../utils/markdownBlocks';

/** One blank-line-delimited markdown block. Memoized so a block whose text
 * hasn't changed since the last flush skips re-parsing — only the growing
 * tail block re-parses as streamed text appends. */
const MarkdownBlock = memo(function MarkdownBlock({
  block,
  growing,
}: {
  block: string;
  growing?: boolean;
}) {
  const source = useLinkedPlanRefs(block);
  // Plan changes re-render this component; reusing the element keeps
  // markdown-to-jsx from recompiling an unchanged string.
  return useMemo(
    () => (
      <Markdown options={growing ? growingBlockMarkdownOptions : markdownOptions}>
        {source}
      </Markdown>
    ),
    [source, growing]
  );
});

/** Markdown for a still-growing text group. Splits the accumulated content
 * into blocks and renders each through its own memoized `<Markdown>` call, so
 * a buffer flush re-parses only the tail block instead of the full string. */
export const StreamingMarkdown = memo(function StreamingMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

  return (
    <>
      {blocks.map((block, idx) => (
        <MarkdownBlock key={idx} block={block} growing={idx === blocks.length - 1} />
      ))}
    </>
  );
});

/** Markdown for a text group that has stopped growing. */
export const StaticMarkdown = memo(function StaticMarkdown({ content }: { content: string }) {
  const source = useLinkedPlanRefs(content);
  return useMemo(() => <Markdown options={markdownOptions}>{source}</Markdown>, [source]);
});
