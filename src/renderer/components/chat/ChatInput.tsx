
interface ChatInputProps {
  onCancel: () => void;
  disabled?: boolean;
}

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSend = () => {
    const trimmed = message.trim();
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
        <textarea
          ref={textareaRef}
          value={message}
          onKeyDown={handleKeyDown}
          rows={1}
        />

          <button
          >
            </svg>
          </button>
      </div>
    </div>
  );
}
