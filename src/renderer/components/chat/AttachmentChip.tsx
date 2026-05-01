import { memo, useEffect, useRef, useState } from 'react';
import type { ChatAttachment } from '../../../shared/types';
import { CloseIcon } from '../icons';
import { openTempAttachment, readAttachmentAsDataUrl } from '../../services/attachmentService';
import { Modal } from '../ui/Modal';

/**
 * A single attachment chip — used both in the composer (with a remove button)
 * and in the message list (read-only, click to open).
 *
 * - Image: thumbnail + filename. Click thumbnail to open lightbox preview.
 * - PDF / text: typed icon + filename. Click to open in OS default viewer.
 */
interface AttachmentChipProps {
  attachment: ChatAttachment;
  /** Optional remove handler. When omitted, the chip is read-only. */
  onRemove?: () => void;
  /** Diameter of the icon/thumbnail box. Defaults to 32px (composer). */
  thumbnailSize?: number;
}

function truncateFilename(name: string, max = 22): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot < name.length - 8) return `${name.slice(0, max - 1)}…`;
  const ext = name.slice(dot);
  const stem = name.slice(0, dot);
  const stemMax = Math.max(1, max - ext.length - 1);
  return `${stem.slice(0, stemMax)}…${ext}`;
}

const PdfIcon = memo(function PdfIcon({ size }: { size: number }) {
  return (
    <svg
      width={size * 0.55}
      height={size * 0.55}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
      <text x="12" y="17" textAnchor="middle" fontSize="5" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  );
});

const TextIcon = memo(function TextIcon({ size }: { size: number }) {
  return (
    <svg
      width={size * 0.55}
      height={size * 0.55}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h6" />
    </svg>
  );
});

const ImagePlaceholderIcon = memo(function ImagePlaceholderIcon({ size }: { size: number }) {
  return (
    <svg
      width={size * 0.55}
      height={size * 0.55}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" strokeLinejoin="round" />
      <circle cx="8.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5-5-9 8" />
    </svg>
  );
});

function ImageThumbnail({
  attachment,
  size,
}: {
  attachment: Extract<ChatAttachment, { kind: 'image' }>;
  size: number;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'errored'>('loading');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setStatus('loading');
    setDataUrl(null);
    void readAttachmentAsDataUrl(attachment.path, attachment.mediaType).then((result: { success: true; dataUrl: string } | { success: false; error: string }) => {
      if (cancelledRef.current) return;
      if (result.success) {
        setDataUrl(result.dataUrl);
        setStatus('loaded');
      } else {
        setStatus('errored');
      }
    });
    return () => {
      cancelledRef.current = true;
    };
  }, [attachment.path, attachment.mediaType]);

  if (status === 'loaded' && dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={attachment.filename}
        className="rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // Loading and errored both fall back to the image placeholder. Errored gets
  // a slightly muted treatment so the user can tell the file is gone, but we
  // don't surface a hard error — the temp file has likely just been cleaned up.
  const isErrored = status === 'errored';
  return (
    <div
      className={`flex items-center justify-center rounded bg-surface-3 ${isErrored ? 'text-text-muted/60' : 'text-text-muted'}`}
      style={{ width: size, height: size }}
      aria-label={isErrored ? `${attachment.filename} (preview unavailable)` : attachment.filename}
      title={isErrored ? 'Preview unavailable — original file no longer accessible' : undefined}
    >
      <ImagePlaceholderIcon size={size} />
    </div>
  );
}

function ImageLightbox({
  attachment,
  isOpen,
  onClose,
}: {
  attachment: Extract<ChatAttachment, { kind: 'image' }>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'errored'>('loading');
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStatus('loading');
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    void readAttachmentAsDataUrl(attachment.path, attachment.mediaType).then((result: { success: true; dataUrl: string } | { success: false; error: string }) => {
      if (cancelled) return;
      if (result.success) {
        setDataUrl(result.dataUrl);
        setStatus('loaded');
      } else {
        setStatus('errored');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.path, attachment.mediaType, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" className="!bg-transparent !shadow-none !border-0">
      <div className="flex flex-col items-center justify-center gap-3 p-4">
        {status === 'loaded' && dataUrl ? (
          <img
            src={dataUrl}
            alt={attachment.filename}
            className="max-h-[80vh] max-w-full rounded shadow-lg"
          />
        ) : status === 'errored' ? (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <div
              className="flex items-center justify-center rounded bg-surface-3"
              style={{ width: 160, height: 160 }}
            >
              <ImagePlaceholderIcon size={160} />
            </div>
            <div className="text-sm">Preview unavailable</div>
          </div>
        ) : (
          <div className="text-text-muted">Loading…</div>
        )}
        <div className="text-xs text-text-muted">{attachment.filename}</div>
      </div>
    </Modal>
  );
}

async function openWithOs(filePath: string): Promise<void> {
  try {
    await openTempAttachment(filePath);
  } catch (err) {
    console.error('[AttachmentChip] openTempAttachment failed:', err);
  }
}

export const AttachmentChip = memo(function AttachmentChip({
  attachment,
  onRemove,
  thumbnailSize = 32,
}: AttachmentChipProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const filename = truncateFilename(attachment.filename);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (attachment.kind === 'image') {
      setLightboxOpen(true);
    } else {
      void openWithOs(attachment.path);
    }
  };

  let thumbnail: React.ReactNode;
  if (attachment.kind === 'image') {
    thumbnail = <ImageThumbnail attachment={attachment} size={thumbnailSize} />;
  } else if (attachment.kind === 'pdf') {
    thumbnail = (
      <div
        className="flex items-center justify-center rounded bg-danger-muted text-danger"
        style={{ width: thumbnailSize, height: thumbnailSize }}
      >
        <PdfIcon size={thumbnailSize} />
      </div>
    );
  } else {
    thumbnail = (
      <div
        className="flex items-center justify-center rounded bg-accent-subtle text-accent"
        style={{ width: thumbnailSize, height: thumbnailSize }}
      >
        <TextIcon size={thumbnailSize} />
      </div>
    );
  }

  return (
    <>
      <div className="inline-flex items-center gap-2 pl-1 pr-2 py-1 bg-surface-2 border border-border-subtle rounded text-xs text-text-primary">
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          title={
            attachment.kind === 'image'
              ? `Preview ${attachment.filename}`
              : `Open ${attachment.filename} with default app`
          }
          aria-label={
            attachment.kind === 'image'
              ? `Preview attachment ${attachment.filename}`
              : `Open attachment ${attachment.filename}`
          }
        >
          {thumbnail}
          <span className="max-w-40 truncate">{filename}</span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-text-muted hover:text-danger transition-colors"
            title="Remove attachment"
            aria-label={`Remove ${attachment.filename}`}
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        )}
      </div>
      {attachment.kind === 'image' && (
        <ImageLightbox
          attachment={attachment}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
});
