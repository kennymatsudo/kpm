/**
 * Shared markdown configuration for external link handling
 *
 * All links in rendered markdown should open in the user's default browser,
 * not navigate within the Electron app.
 */

import type { MarkdownToJSX } from 'markdown-to-jsx';
import type { JSX } from 'react';

/**
 * Click handler for markdown links - opens in external browser
 */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  e.preventDefault();
  if (href) {
  }
}

/**
 *
 * Usage:
 * ```tsx
 * import Markdown from 'markdown-to-jsx';
 * ```
 */
export const markdownOverrides: MarkdownToJSX.Overrides = {
  a: {
  },
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
        if (typeof child === 'string') {
          const highlighted = highlightSearchMatches(child, searchQuery, currentMatchIndex, matchCounter);
          return highlighted.length === 1 && typeof highlighted[0] === 'string'
            ? highlighted[0]
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
    a: {
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
