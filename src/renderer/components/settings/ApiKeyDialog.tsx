import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
}

export function ApiKeyDialog({ onClose }: Props) {
  const [apiKey, setApiKey] = useState('');

  // Check if there's an existing key on mount
  useEffect(() => {

  const handleTest = async () => {
    if (!apiKey) {
      return;
    }

    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      return;
    }

    }
  };

  const handleDelete = async () => {
    }
  };

  return (
            </svg>
        </div>



            <button
            >
            </button>
        </div>
  );
}
