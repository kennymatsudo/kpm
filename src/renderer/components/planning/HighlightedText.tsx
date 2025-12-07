import { memo, useMemo } from 'react';

interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * Renders text with matching portions highlighted.
 * Case-insensitive matching.
 * Memoized for performance during search operations.
 */
export const HighlightedText = memo(function HighlightedText({ text, query, className = '' }: HighlightedTextProps) {
  const parts = useMemo(() => {
    if (!query.trim()) {
      return [{ text, isMatch: false }];
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const result: { text: string; isMatch: boolean }[] = [];

    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery);

    while (index !== -1) {
      // Add non-matching part before match
      if (index > lastIndex) {
        result.push({ text: text.slice(lastIndex, index), isMatch: false });
      }
      // Add matching part
      result.push({ text: text.slice(index, index + query.length), isMatch: true });
      lastIndex = index + query.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining non-matching part
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), isMatch: false });
    }

    return result;
  }, [text, query]);

  // Fast path: no matches
  if (parts.length === 1 && !parts[0].isMatch) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark
            key={i}
            className="bg-warning/30 text-inherit rounded-sm px-0.5 -mx-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
});
