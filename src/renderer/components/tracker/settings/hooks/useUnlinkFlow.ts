import { useState } from 'react';

interface UnlinkFlowDeps {
  associationId: string;
  onUnlink: () => void;
}

interface UnlinkFlowResult {
  isUnlinking: boolean;
  showUnlinkConfirm: boolean;
  setShowUnlinkConfirm: (value: boolean) => void;
  handleUnlink: () => Promise<void>;
}

export function useUnlinkFlow({
  associationId,
  onUnlink,
}: UnlinkFlowDeps): UnlinkFlowResult {
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  async function handleUnlink(): Promise<void> {
    setIsUnlinking(true);
    try {
      onUnlink();
    } catch (e) {
      console.error('Failed to unlink:', e);
    } finally {
      setIsUnlinking(false);
      setShowUnlinkConfirm(false);
    }
  }

  return {
    isUnlinking,
    showUnlinkConfirm,
    setShowUnlinkConfirm,
    handleUnlink,
  };
}
