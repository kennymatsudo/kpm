/**
 * Shared markdown configuration for external link handling
 *
 * All links in rendered markdown should open in the user's default browser,
 * not navigate within the Electron app.
 */

import type { MarkdownToJSX } from 'markdown-to-jsx';
import { Children, Fragment, isValidElement, useState } from 'react';
import type { JSX } from 'react';
import { openExternalUrl } from '../services/shellService';
import { PlanRefChip } from '../components/plan-ref/PlanRefChip';
import { FileRefLink } from '../components/file-ref/FileRefLink';
import { MermaidDiagram } from '../components/ui/MermaidDiagram';
import { CheckIcon, CopyIcon } from '../components/icons';
import { copyToClipboard } from './clipboard';
import { findRefs, PLAN_REF_REGEX } from '../../shared/planRefs';
import { isPathLike } from '../../shared/pathRefs';
import { extractHeadings, slugify, type DocHeading } from './headingOutline';

/**
 * URI scheme used to smuggle a plan reference through markdown-to-jsx as a
 * regular link. The `a` override below detects it and renders a chip instead
 * of an anchor.
 */
const PLAN_REF_SCHEME = 'kpm-plan:';
const PLAN_REF_PLACEHOLDER = '\u00a0';

/**
 * Click handler for markdown links - opens in external browser
 */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  e.preventDefault();
  if (href) {
    openExternalUrl(href);
  }
}

/**
 * Rewrite `@plan/<uuid>` tokens in a markdown source string into markdown
 * links that the `a` override will replace with `<PlanRefChip>`. Skips refs
 * inside fenced code blocks (using the same skip logic as the resolver).
 *
 * Tokens become `[\u00a0](kpm-plan:<uuid>)` — the link text is a non-breaking
 * space placeholder; the chip renders its own label.
 */
export function transformPlanRefs(content: string): string {
  if (!content) return content;
  // Fast path: no @plan tokens anywhere.
  PLAN_REF_REGEX.lastIndex = 0;
  if (!PLAN_REF_REGEX.test(content)) return content;

  const matches = findRefs(content);
  if (matches.length === 0) return content;

  let out = '';
  let cursor = 0;
  for (const match of matches) {
    out += content.slice(cursor, match.start);
    out += `[${PLAN_REF_PLACEHOLDER}](${PLAN_REF_SCHEME}${match.id})`;
    cursor = match.end;
  }
  out += content.slice(cursor);
  return out;
}

/**
 * Render either a `<PlanRefChip>` (for `kpm-plan:` URIs) or an external
 * anchor. Used by every `Markdown` callsite via `markdownOverrides`.
 */
function renderAnchor({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href?.startsWith(PLAN_REF_SCHEME)) {
    return <PlanRefChip id={href.slice(PLAN_REF_SCHEME.length)} />;
  }
  return (
    <a href={href} onClick={(e) => handleLinkClick(e, href)} {...props}>
      {children}
    </a>
  );
}

/**
 * Custom overrides for markdown-to-jsx that open links externally and render
 * `@plan/<uuid>` tokens as inline chips.
 *
 * Usage:
 * ```tsx
 * import Markdown from 'markdown-to-jsx';
 * import { markdownOptions, transformPlanRefs } from '../../utils/markdown';
 * <Markdown options={markdownOptions}>{transformPlanRefs(content)}</Markdown>
 * ```
 */
/**
 * Extract the inline-code content as a string if children is a single text
 * node. markdown-to-jsx usually passes a bare string for inline `code`, but
 * sometimes an array of one. Anything else (mixed children, formatting) is
 * left alone so we never accidentally swallow a code span.
 */
function inlineCodeText(children: React.ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') {
    return children[0];
  }
  return null;
}

function codeBlockText(children: React.ReactNode): string | null {
  if (typeof children === 'string') return children;
  const parts = Children.toArray(children);
  if (parts.every((part) => typeof part === 'string')) {
    return parts.join('');
  }
  return null;
}

function renderCode({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  // Block code spans have a `lang-…` className from the fence; inline ones
  // do not. Skip path detection inside fenced blocks to preserve syntax
  // highlighting and avoid linkifying lines of source code.
  const isInline = !className;
  if (isInline) {
    const text = inlineCodeText(children);
    if (text && isPathLike(text)) {
      return <FileRefLink text={text} />;
    }
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function renderPre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const child = Children.toArray(children)[0];
  if (isValidElement<React.HTMLAttributes<HTMLElement>>(child)) {
    const cls = child.props.className ?? '';
    if (cls.includes('lang-mermaid')) {
      const source = codeBlockText(child.props.children);
      if (source !== null) {
        return <MermaidDiagram source={source.trim()} />;
      }
    }
  }
  return <pre {...props}>{children}</pre>;
}

function codeBlockLanguage(className: string): string | null {
  const match = /\blang(?:uage)?-([^\s]+)/.exec(className);
  return match?.[1] ?? null;
}

function normalizedCodeBlockText(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function FocusCodeBlock({
  children,
  className = '',
  source,
  language,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & { source: string; language: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(normalizedCodeBlockText(source), 'Code');
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="focus-code-block group/code">
      <div className="focus-code-block-header">
        {language ? (
          <span className="truncate font-mono text-[11px] text-text-muted">{language}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className={className} {...props}>
        {children}
      </pre>
    </div>
  );
}

function renderFocusPre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const child = Children.toArray(children)[0];
  if (isValidElement<React.HTMLAttributes<HTMLElement>>(child)) {
    const cls = child.props.className ?? '';
    const source = codeBlockText(child.props.children);
    if (cls.includes('lang-mermaid') && source !== null) {
      return <MermaidDiagram source={source.trim()} />;
    }
    if (source !== null) {
      return (
        <FocusCodeBlock
          {...props}
          source={source}
          language={codeBlockLanguage(cls)}
        >
          {children}
        </FocusCodeBlock>
      );
    }
  }
  return <pre {...props}>{children}</pre>;
}

export const markdownOverrides: MarkdownToJSX.Overrides = {
  a: {
    component: renderAnchor,
  },
  code: {
    component: renderCode,
  },
  pre: {
    component: renderPre,
  },
};

/**
 * Base markdown options with external link handling and HTML parsing disabled.
 * Disabling raw HTML parsing prevents JSX/React code in markdown from being
 * interpreted as actual React elements (e.g. `<ConfirmationModal />` in code examples).
 */
export const markdownOptions: MarkdownToJSX.Options = {
  overrides: markdownOverrides,
  disableParsingRawHTML: true,
};

/**
 * Converts single newlines to Markdown hard breaks (two trailing spaces + newline)
 * so that line-by-line content (e.g. metadata blocks) renders as separate lines.
 * Code fences and inline code are left untouched.
 */
export function addSoftBreaks(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/(?<!\n)\n(?!\n)/g, '  \n');
    })
    .join('');
}

// Heading extraction lives in a React-free module so it can be unit-tested in
// isolation; re-exported here since the Focus Mode components import it from
// this file alongside the renderer-only helpers below.
export { extractHeadings, slugify };
export type { DocHeading };

/** Recursively collect the plain text of a React node tree (for heading ids). */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

interface FocusMarkdownOptions {
  searchQuery?: string;
  currentMatchIndex?: number;
}

/**
 * Markdown options for the Focus Mode reader: the base overrides plus `h1`–`h6`
 * components that emit a slug `id`, so the outline can anchor-jump and the
 * scroll-spy can observe each heading. When search is active, highlights are
 * rendered inside those same heading components so ids stay stable.
 *
 * IMPORTANT: create a fresh instance per *content/search state* and memoize the
 * rendered `<Markdown>` element on those inputs too. The dedup counter lives in
 * this closure and advances in document order; reusing one instance across
 * re-renders would drift the ids.
 */
export function createFocusMarkdownOptions({
  searchQuery = '',
  currentMatchIndex = 0,
}: FocusMarkdownOptions = {}): MarkdownToJSX.Options {
  const seen = new Map<string, number>();
  const trimmedSearch = searchQuery.trim();
  const hasSearch = trimmedSearch.length > 0;
  const processChildren = hasSearch
    ? createSearchChildrenProcessor(trimmedSearch, currentMatchIndex, { count: 0 })
    : (children: React.ReactNode) => children;

  const searchableOverride = (Tag: keyof JSX.IntrinsicElements) => ({
    component: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const Element = Tag as React.ElementType;
      return <Element {...props}>{processChildren(children)}</Element>;
    },
  });

  const heading = (level: number) => ({
    component: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const Tag = `h${level}` as React.ElementType;
      const base = slugify(nodeText(children)) || 'section';
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count}`;
      return (
        <Tag id={id} {...props}>
          {processChildren(children)}
        </Tag>
      );
    },
  });

  const overrides: MarkdownToJSX.Overrides = {
    ...markdownOverrides,
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    pre: {
      component: renderFocusPre,
    },
  };

  if (hasSearch) {
    Object.assign(overrides, {
      a: {
        component: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
          if (href?.startsWith(PLAN_REF_SCHEME)) {
            return <PlanRefChip id={href.slice(PLAN_REF_SCHEME.length)} />;
          }
          return (
            <a href={href} onClick={(e) => handleLinkClick(e, href)} {...props}>
              {processChildren(children)}
            </a>
          );
        },
      },
      p: searchableOverride('p'),
      li: searchableOverride('li'),
      td: searchableOverride('td'),
      th: searchableOverride('th'),
      strong: searchableOverride('strong'),
      em: searchableOverride('em'),
      code: {
        component: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
          const isInline = !className;
          return (
            <code className={className} {...props}>
              {isInline ? processChildren(children) : children}
            </code>
          );
        },
      },
    });
  }

  return {
    overrides,
    disableParsingRawHTML: true,
  };
}

/**
 * Highlights search matches in a text string.
 * Returns an array of React elements with matches wrapped in <mark>.
 */
function highlightSearchMatches(
  text: string,
  searchQuery: string,
  currentMatchIndex: number,
  matchCounter: { count: number }
): React.ReactNode[] {
  if (!searchQuery || searchQuery.length === 0) {
    return [text];
  }

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = searchQuery.toLowerCase();
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    // Add text before match
    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }

    // Add highlighted match
    const matchText = text.substring(index, index + searchQuery.length);
    const isCurrentMatch = matchCounter.count === currentMatchIndex;
    parts.push(
      <mark
        key={`match-${matchCounter.count}`}
        className={`rounded px-0.5 ${
          isCurrentMatch
            ? 'bg-accent text-white'
            : 'bg-warning/40 text-text-primary'
        }`}
        data-search-match={matchCounter.count}
        data-current={isCurrentMatch}
      >
        {matchText}
      </mark>
    );
    matchCounter.count++;

    lastIndex = index + searchQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function createSearchChildrenProcessor(
  searchQuery: string,
  currentMatchIndex: number,
  matchCounter: { count: number }
) {
  return (children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
      const highlighted = highlightSearchMatches(children, searchQuery, currentMatchIndex, matchCounter);
      return highlighted.length === 1 && typeof highlighted[0] === 'string'
        ? highlighted[0]
        : <>{highlighted}</>;
    }
    if (Array.isArray(children)) {
      return Children.toArray(children).map((child, i) => {
        if (typeof child === 'string') {
          const highlighted = highlightSearchMatches(child, searchQuery, currentMatchIndex, matchCounter);
          return highlighted.length === 1 && typeof highlighted[0] === 'string'
            ? highlighted[0]
            : <Fragment key={`highlight-${i}`}>{highlighted}</Fragment>;
        }
        return child;
      });
    }
    return children;
  };
}

/**
 * Creates markdown-to-jsx overrides with search highlighting.
 * Wraps text content in highlight marks when matching the search query.
 *
 * Usage:
 * ```tsx
 * import Markdown from 'markdown-to-jsx';
 * const options = createSearchHighlightOptions('search term', 0);
 * <Markdown options={options}>{content}</Markdown>
 * ```
 */
export function createSearchHighlightOverrides(
  searchQuery: string,
  currentMatchIndex: number
): MarkdownToJSX.Overrides {
  // Shared counter to track match index across all text nodes
  const matchCounter = { count: 0 };
  const processChildren = createSearchChildrenProcessor(searchQuery, currentMatchIndex, matchCounter);

  // Helper to create a component override
  const createOverride = (Tag: keyof JSX.IntrinsicElements) => ({
    component: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const Element = Tag as React.ElementType;
      return <Element {...props}>{processChildren(children)}</Element>;
    },
  });

  return {
    // Link handling: chip for plan refs, external-open for everything else.
    a: {
      component: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (href?.startsWith(PLAN_REF_SCHEME)) {
          return <PlanRefChip id={href.slice(PLAN_REF_SCHEME.length)} />;
        }
        return (
          <a
            href={href}
            onClick={(e) => handleLinkClick(e, href)}
            {...props}
          >
            {processChildren(children)}
          </a>
        );
      },
    },
    // Text elements that can contain searchable content
    p: createOverride('p'),
    h1: createOverride('h1'),
    h2: createOverride('h2'),
    h3: createOverride('h3'),
    h4: createOverride('h4'),
    h5: createOverride('h5'),
    h6: createOverride('h6'),
    li: createOverride('li'),
    td: createOverride('td'),
    th: createOverride('th'),
    strong: createOverride('strong'),
    em: createOverride('em'),
    blockquote: {
      component: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote {...props}>{children}</blockquote>
      ),
    },
    code: {
      component: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
        // For inline code, highlight; for code blocks, don't process (preserve syntax highlighting)
        const isInline = !className;
        return (
          <code className={className} {...props}>
            {isInline ? processChildren(children) : children}
          </code>
        );
      },
    },
    pre: {
      component: renderPre,
    },
  };
}

/**
 * Creates full markdown options with search highlighting and HTML parsing disabled.
 */
export function createSearchHighlightOptions(
  searchQuery: string,
  currentMatchIndex: number
): MarkdownToJSX.Options {
  return {
    overrides: createSearchHighlightOverrides(searchQuery, currentMatchIndex),
    disableParsingRawHTML: true,
  };
}
