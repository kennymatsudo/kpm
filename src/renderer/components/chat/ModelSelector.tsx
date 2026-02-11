import { useChatStore, type ChatClaudeModel } from '../../stores';

const MODELS: { value: ChatClaudeModel; label: string; description: string }[] = [
];

export function ModelSelector() {

  const handleModelChange = (newModel: ChatClaudeModel, e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`
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
              cursor-pointer
              disabled:cursor-not-allowed disabled:opacity-50
              ${isSelected
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
