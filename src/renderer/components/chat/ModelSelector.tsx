
];


    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`
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
