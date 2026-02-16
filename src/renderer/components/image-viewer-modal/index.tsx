import { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, ModalHeader } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { formatFileSize } from '../../utils/image';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  dataUrl: string;
  fileSize?: number;
}

export function ImageViewerModal({
  isOpen,
  onClose,
  filename,
  dataUrl,
  fileSize,
}: ImageViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom when modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setNaturalSize(null);
    }
  }, [isOpen]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setNaturalSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.25, 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleZoomIn, handleZoomOut, handleResetZoom]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      aria-labelledby="image-viewer-title"
    >
      <div className="flex flex-col h-full max-h-[85vh]">
        {/* Header */}
        <ModalHeader onClose={onClose} id="image-viewer-title">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <span className="text-base font-medium text-text-primary">{filename}</span>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                {naturalSize && (
                  <span>{naturalSize.width} x {naturalSize.height}</span>
                )}
                {fileSize && <span>{formatFileSize(fileSize)}</span>}
              </div>
            </div>
          </div>
        </ModalHeader>

        {/* Toolbar */}
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-1/50">
          <MotionButton
            variant="secondary"
            onClick={handleZoomOut}
            className="!px-2"
            title="Zoom out (-)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </MotionButton>
          <span className="text-sm text-text-muted w-16 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <MotionButton
            variant="secondary"
            onClick={handleZoomIn}
            className="!px-2"
            title="Zoom in (+)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </MotionButton>
          <div className="w-px h-5 bg-border-default mx-2" />
          <MotionButton
            variant="secondary"
            onClick={handleResetZoom}
            className="text-xs"
            title="Reset zoom (0)"
          >
            Fit
          </MotionButton>
        </div>

        {/* Image container */}
        <div className="flex-1 overflow-auto bg-surface-2 p-4">
          <div className="min-h-full flex items-center justify-center">
            <img
              ref={imageRef}
              src={dataUrl}
              alt={filename}
              onLoad={handleImageLoad}
              className="max-w-none transition-transform duration-150"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface-1/50">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">+</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">-</kbd>
              <span>zoom</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xxs font-mono">0</kbd>
              <span>reset</span>
            </span>
          </div>
          <MotionButton variant="secondary" onClick={onClose}>
            Close
          </MotionButton>
        </div>
      </div>
    </Modal>
  );
}
