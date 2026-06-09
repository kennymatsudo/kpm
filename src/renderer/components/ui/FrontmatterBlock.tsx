/**
 * Collapsed disclosure for YAML frontmatter in markdown previews.
 *
 * Shown instead of rendering the frontmatter as document content (which
 * mangles it into a horizontal rule plus run-together paragraphs), while
 * still keeping the preview honest about what is in the file.
 */

interface FrontmatterBlockProps {
  /** Raw frontmatter text (without the `---` fences). */
  source: string;
}

export function FrontmatterBlock({ source }: FrontmatterBlockProps) {
  return (
    <details className="not-prose mb-5 rounded-lg border border-border-subtle bg-surface-1/60">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        Metadata
      </summary>
      <pre className="m-0 px-3 pb-2.5 pt-0.5 text-xs font-mono leading-relaxed text-text-secondary whitespace-pre-wrap">
        {source}
      </pre>
    </details>
  );
}
