
interface EpicKeyDeps {
  associationId: string;
  initialEpicKey: string | null;
}

interface EpicKeyResult {
  epicKey: string;
  isSavingEpicKey: boolean;
  epicKeyError: string | null;
  setEpicKey: (value: string) => void;
  handleSaveEpicKey: () => Promise<void>;
}

export function useEpicKey({
  associationId,
  initialEpicKey,
}: EpicKeyDeps): EpicKeyResult {
  const [epicKey, setEpicKey] = useState(initialEpicKey ?? '');
  const [isSavingEpicKey, setIsSavingEpicKey] = useState(false);
  const [epicKeyError, setEpicKeyError] = useState<string | null>(null);

  async function handleSaveEpicKey(): Promise<void> {
    setIsSavingEpicKey(true);
    setEpicKeyError(null);
    try {
      if (!result.success) {
        setEpicKeyError(result.error || 'Failed to save');
      }
    } catch (e) {
      setEpicKeyError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSavingEpicKey(false);
    }
  }

  return {
    epicKey,
    isSavingEpicKey,
    epicKeyError,
    setEpicKey,
    handleSaveEpicKey,
  };
}
