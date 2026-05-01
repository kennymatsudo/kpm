/**
 * Shared markdown configuration for external link handling
 *
 * All links in rendered markdown should open in the user's default browser,
 * not navigate within the Electron app.
 */

import type { MarkdownToJSX } from 'markdown-to-jsx';
import type { JSX } from 'react';
import { openExternalUrl } from '../services/shellService';
import { PlanRefChip } from '../components/plan-ref/PlanRefChip';
import { findRefs, PLAN_REF_REGEX } from '../../shared/planRefs';

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
export const markdownOverrides: MarkdownToJSX.Overrides = {
  a: {
    component: renderAnchor,
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

  searchQuery: string,
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
