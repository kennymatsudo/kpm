interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * Renders text with matching portions highlighted.
 * Case-insensitive matching.
 */



    }

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
