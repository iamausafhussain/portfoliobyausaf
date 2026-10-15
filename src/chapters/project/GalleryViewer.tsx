/**
 * Full-screen gallery viewer (spec 05 PP-3). A native modal <dialog>: focus is trapped and
 * Esc closes it; focus returns to the thumbnail that opened it. Arrow keys and swipes move
 * between images.
 */
import { useEffect, useRef } from 'react';
import type { ImageRef } from '../../data/schemas';
import { publicMediaUrl } from '../../data/source';
import styles from './project.module.css';

export function GalleryViewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: ImageRef[];
  /** the open image, or null when closed */
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const open = index !== null;
  const count = images.length;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  if (count === 0) return null;
  const i = index ?? 0;
  const go = (step: number) => onIndex((i + step + count) % count);
  const img = images[i]!;

  return (
    <dialog
      ref={ref}
      className={styles.viewer}
      aria-label={`Image ${i + 1} of ${count}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      }}
      onClick={(e) => {
        // a click on the dark surround closes it
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <figure
          className={styles.viewerFigure}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, id: e.pointerId };
          }}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s || s.id !== e.pointerId) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          <img
            key={img.path}
            src={publicMediaUrl(img.path)}
            alt={img.alt}
            width={img.width ?? undefined}
            height={img.height ?? undefined}
            className={styles.viewerImage}
            draggable={false}
          />
          <figcaption className={styles.viewerCaption}>
            <span className="label">
              {i + 1} / {count}
            </span>
            <span>{img.alt}</span>
          </figcaption>
        </figure>
      )}
      <div className={styles.viewerControls}>
        {count > 1 && (
          <>
            <button
              type="button"
              className={styles.viewerButton}
              onClick={() => go(-1)}
              aria-label="Previous image"
            >
              ←
            </button>
            <button
              type="button"
              className={styles.viewerButton}
              onClick={() => go(1)}
              aria-label="Next image"
            >
              →
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.viewerButton}
          onClick={onClose}
          aria-label="Close gallery"
          autoFocus
        >
          ✕
        </button>
      </div>
    </dialog>
  );
}
