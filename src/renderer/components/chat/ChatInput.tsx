import { ModelSelector } from './ModelSelector';

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

  // Escape key to cancel streaming
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, onCancel]);

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check if clipboard contains an image
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior

        const blob = item.getAsFile();
        if (!blob) continue;

        try {
          // Convert blob to Uint8Array
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Save via IPC

          if (result.success) {
          } else {
          }
        } catch (error) {
          console.error('Failed to process pasted image:', error);
        }

        break; // Only handle first image
      }
    }
    // If no image found, allow default text paste behavior
  };


    // Delete file in background (best-effort, stale cleanup handles orphans)
    try {
    } catch (error) {
    }
  };

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
        <div className="flex flex-wrap gap-2 mb-2">
          ))}
        </div>
      )}

        </div>
      )}

        <textarea
          ref={textareaRef}
          value={message}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
