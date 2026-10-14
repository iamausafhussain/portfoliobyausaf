/** Upload fields: image, image list, video, PDF (spec 02 AD-30 – AD-37). */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useController, useWatch } from 'react-hook-form';
import type { ImageRef } from '../../data/schemas';
import { useMediaSession } from '../media/MediaSession';
import { checkVideo, processImage, uploadBlob, type ProcessedImage } from '../media/pipeline';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import { bucketLimits } from '../repository/limits';
import type { Bucket } from '../repository/types';
import { FieldShell } from '../ui/FieldShell';
import { Icon } from '../ui/Icon';
import { Button, cx, IconButton, Notice, ProgressBar, ui } from '../ui/primitives';
import { TextField, useFieldError, type BaseFieldProps } from './basic';
import styles from './fields.module.css';

const messageOf = (e: unknown) => (isRepoError(e) ? e.message : 'Upload failed. Please try again.');

/** Upload state shared by the media fields. */
function useUploader() {
  const repo = useRepository();
  const session = useMediaSession();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const upload = async (bucket: Bucket, blob: Blob, contentType: string): Promise<string | null> => {
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    session.begin();
    try {
      const path = await uploadBlob(repo, bucket, session.folder, blob, contentType, {
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      session.track(path);
      return path;
    } catch (e) {
      setError(messageOf(e));
      return null;
    } finally {
      session.end();
      setProgress(null);
      abort.current = null;
    }
  };

  /** Counts processing time (resize, sanitise) as "uploading" too, so Save waits for it. */
  const during = async <T,>(fn: () => Promise<T>): Promise<T> => {
    session.begin();
    try {
      return await fn();
    } finally {
      session.end();
    }
  };

  return {
    repo,
    progress,
    error,
    setError,
    upload,
    during,
    cancel: () => abort.current?.abort(),
  };
}

function Dropzone({
  accept,
  multiple,
  onFiles,
  label,
  hint,
  disabled,
  describedBy,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  hint: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFiles([...e.dataTransfer.files]);
  };
  return (
    <div
      className={cx(styles.dropzone, over && styles.dropzoneOver)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <Icon name="upload" size={22} />
      <Button
        size="small"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-describedby={describedBy}
      >
        {label}
      </Button>
      <span className={ui.help}>{hint}</span>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function UploadProgress({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return (
    <div className={styles.uploading}>
      <ProgressBar value={progress} label="Upload progress" />
      <div className={styles.uploadingRow}>
        <span className={ui.help}>Uploading… {Math.round(progress * 100)}%</span>
        <Button size="small" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const imageAccept = bucketLimits.images.types.join(',');
const imageHint =
  'JPEG, PNG, WebP, AVIF or SVG. Large photos are resized and converted to WebP automatically.';

/* ------------------------------------------------------------------ */

export function ImageField({
  name,
  label,
  required,
  help,
  capture,
}: BaseFieldProps & {
  /** Offers "Capture from video" (hero posters) */
  capture?: { label: string; run: () => Promise<ProcessedImage> };
}) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const altError = useFieldError(`${name}.alt`);
  const up = useUploader();
  const value = (field.value ?? null) as ImageRef | null;
  const [working, setWorking] = useState(false);

  const store = async (img: ProcessedImage) => {
    const path = await up.upload('images', img.blob, img.contentType);
    if (path) {
      field.onChange({
        path,
        alt: value?.alt ?? '',
        width: img.width ?? null,
        height: img.height ?? null,
      });
    }
  };

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setWorking(true);
    try {
      await up.during(async () => store(await processImage(file)));
    } catch (e) {
      up.setError(messageOf(e));
    } finally {
      setWorking(false);
    }
  };

  const doCapture = async () => {
    if (!capture) return;
    setWorking(true);
    try {
      await up.during(async () => store(await capture.run()));
    } catch (e) {
      up.setError(messageOf(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <FieldShell
      label={label}
      required={required}
      help={help}
      error={error && !altError ? error : undefined}
      group
    >
      {() => (
        <div className={styles.media}>
          {up.progress !== null ? (
            <UploadProgress progress={up.progress} onCancel={up.cancel} />
          ) : value ? (
            <div className={styles.imageRow}>
              <img className={styles.thumb} src={up.repo.files.url(value.path)} alt="" />
              <div className={styles.imageMeta}>
                <TextField
                  name={`${name}.alt`}
                  label="Alt text"
                  required
                  max={200}
                  help="Describe the image for people who can't see it."
                />
                <div className={styles.inlineActions}>
                  <ReplaceButton onFiles={onFiles} disabled={working} />
                  {capture && (
                    <Button size="small" icon="camera" onClick={doCapture} busy={working}>
                      {capture.label}
                    </Button>
                  )}
                  <Button size="small" variant="ghost" icon="trash" onClick={() => field.onChange(null)}>
                    Remove
                  </Button>
                </div>
                {value.width && value.height ? (
                  <span className={ui.help}>
                    {value.width} × {value.height}px
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.emptyMedia}>
              <Dropzone
                accept={imageAccept}
                onFiles={onFiles}
                label={working ? 'Processing…' : 'Choose image'}
                hint={imageHint}
                disabled={working}
              />
              {capture && (
                <Button size="small" icon="camera" onClick={doCapture} busy={working}>
                  {capture.label}
                </Button>
              )}
            </div>
          )}
          {up.error && <Notice tone="error">{up.error}</Notice>}
        </div>
      )}
    </FieldShell>
  );
}

function ReplaceButton({ onFiles, disabled }: { onFiles: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="small" icon="upload" onClick={() => input.current?.click()} disabled={disabled}>
        Replace
      </Button>
      <input
        ref={input}
        type="file"
        accept={imageAccept}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

export function ImageListField({
  name,
  label,
  help,
  maxItems = 20,
}: Omit<BaseFieldProps, 'required'> & { maxItems?: number }) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const up = useUploader();
  const items = (Array.isArray(field.value) ? field.value : []) as ImageRef[];
  const [working, setWorking] = useState(false);

  const onFiles = async (files: File[]) => {
    setWorking(true);
    let next = [...items];
    try {
      for (const file of files.slice(0, maxItems - items.length)) {
        const img = await up.during(() => processImage(file));
        const path = await up.upload('images', img.blob, img.contentType);
        if (path) {
          next = [...next, { path, alt: '', width: img.width ?? null, height: img.height ?? null }];
          field.onChange(next);
        }
      }
    } catch (e) {
      up.setError(messageOf(e));
    } finally {
      setWorking(false);
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    field.onChange(next);
  };

  return (
    <FieldShell
      label={label}
      help={help ?? `Up to ${maxItems} images. Every image needs alt text.`}
      error={error}
      count={{ length: items.length, max: maxItems }}
      group
    >
      {() => (
        <div className={styles.media}>
          {items.length > 0 && (
            <ol className={styles.gallery}>
              {items.map((img, i) => (
                <li key={img.path} className={styles.galleryItem}>
                  <img className={styles.thumbSmall} src={up.repo.files.url(img.path)} alt="" />
                  <TextField name={`${name}.${i}.alt`} label={`Image ${i + 1} alt text`} required max={200} />
                  <div className={styles.galleryActions}>
                    <IconButton
                      icon="chevronLeft"
                      label={`Move image ${i + 1} earlier`}
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                    />
                    <IconButton
                      icon="chevronRight"
                      label={`Move image ${i + 1} later`}
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                    />
                    <IconButton
                      icon="trash"
                      label={`Remove image ${i + 1}`}
                      onClick={() => field.onChange(items.filter((_, j) => j !== i))}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {up.progress !== null ? (
            <UploadProgress progress={up.progress} onCancel={up.cancel} />
          ) : (
            items.length < maxItems && (
              <Dropzone
                accept={imageAccept}
                multiple
                onFiles={onFiles}
                label={working ? 'Processing…' : 'Add images'}
                hint={imageHint}
                disabled={working}
              />
            )
          )}
          {up.error && <Notice tone="error">{up.error}</Notice>}
        </div>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A video stored in the videos bucket (source "upload") or an https URL (source "url").
 * `videoRef` exposes the preview element so a poster can be captured from it.
 */
export function VideoField({
  name,
  label,
  required,
  help,
  sourceField,
  accept = 'video/mp4,video/webm',
  videoRef,
}: BaseFieldProps & {
  sourceField: string;
  accept?: string;
  videoRef?: (el: HTMLVideoElement | null) => void;
}) {
  const { field } = useController({ name });
  const source = useWatch({ name: sourceField }) as 'upload' | 'url' | undefined;
  const error = useFieldError(name);
  const up = useUploader();
  const [warning, setWarning] = useState<string | undefined>();
  const value = typeof field.value === 'string' && field.value ? field.value : null;

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setWarning(undefined);
    try {
      const check = checkVideo(file);
      setWarning(check.warning);
      const path = await up.upload('videos', file, check.contentType);
      if (path) field.onChange(path);
    } catch (e) {
      up.setError(messageOf(e));
    }
  };

  if (source === 'url') {
    return (
      <TextField
        name={name}
        label={label}
        required={required}
        type="url"
        nullable={!required}
        placeholder="https://"
        help={help ?? 'A direct link to an MP4/WebM file on a video host or CDN.'}
      />
    );
  }

  const preview = value ? up.repo.files.url(value) : null;

  return (
    <FieldShell label={label} required={required} help={help} error={error} group>
      {() => (
        <div className={styles.media}>
          {up.progress !== null ? (
            <UploadProgress progress={up.progress} onCancel={up.cancel} />
          ) : value ? (
            <div className={styles.videoRow}>
              {preview ? (
                <video
                  ref={videoRef}
                  className={styles.video}
                  src={preview}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  crossOrigin="anonymous"
                />
              ) : (
                <span className={ui.help}>{value}</span>
              )}
              <div className={styles.inlineActions}>
                <Button
                  size="small"
                  variant="ghost"
                  icon="trash"
                  onClick={() => field.onChange(required ? '' : null)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Dropzone
              accept={accept}
              onFiles={onFiles}
              label="Choose video"
              hint="MP4 or WebM, up to 15 MB. Under 4 MB is best for phones."
            />
          )}
          {warning && <Notice tone="warn">{warning}</Notice>}
          {up.error && <Notice tone="error">{up.error}</Notice>}
        </div>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

/** A single PDF (the resume). Replacing it removes the old file after saving (AD-36). */
export function PdfField({ name, label, help }: Omit<BaseFieldProps, 'required'>) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const up = useUploader();
  const value = typeof field.value === 'string' && field.value ? field.value : null;

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const path = await up.upload('documents', file, file.type || 'application/pdf');
    if (path) field.onChange(path);
  };

  return (
    <FieldShell label={label} help={help} error={error} group>
      {() => (
        <div className={styles.media}>
          {up.progress !== null ? (
            <UploadProgress progress={up.progress} onCancel={up.cancel} />
          ) : value ? (
            <div className={styles.fileRow}>
              <Icon name="file" />
              <a href={up.repo.files.url(value)} target="_blank" rel="noreferrer" className={styles.fileName}>
                {value.split('/').pop()}
              </a>
              <Button size="small" variant="ghost" icon="trash" onClick={() => field.onChange(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <Dropzone accept="application/pdf" onFiles={onFiles} label="Choose PDF" hint="PDF, up to 5 MB." />
          )}
          {up.error && <Notice tone="error">{up.error}</Notice>}
        </div>
      )}
    </FieldShell>
  );
}

export function FieldGroup({
  title,
  children,
  description,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.group} aria-labelledby={`group-${title.replace(/\W+/g, '-')}`}>
      <div className={styles.groupHead}>
        <h2 id={`group-${title.replace(/\W+/g, '-')}`} className={styles.groupTitle}>
          {title}
        </h2>
        {description && <p className={ui.help}>{description}</p>}
      </div>
      <div className={styles.groupBody}>{children}</div>
    </section>
  );
}
