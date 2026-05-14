import { useChatStore, type ChatClaudeModel } from '../../stores';

const MODELS: { value: ChatClaudeModel; label: string; description: string }[] = [
  { value: 'sonnet', label: 'Sonnet', description: 'Claude Sonnet — Fast, balanced' },
  { value: 'opus', label: 'Opus', description: 'Claude Opus — Most capable' },
];

export function ModelSelector() {

  const handleModelChange = (newModel: ChatClaudeModel, e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`
        inline-flex items-center rounded-lg p-0.5
        bg-surface-2
        ${isStreaming ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      {MODELS.map((m) => {
        const isSelected = model === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={(e) => handleModelChange(m.value, e)}
            disabled={isStreaming}
            className={`
              flex-1 text-center px-3 py-1 text-tiny font-medium
              transition-colors duration-150 rounded-md
              cursor-pointer
              disabled:cursor-not-allowed disabled:opacity-50
              ${isSelected
                ? 'bg-accent text-white font-semibold'
                : 'text-text-tertiary hover:text-text-secondary'
              }
            `}
            title={m.description}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
