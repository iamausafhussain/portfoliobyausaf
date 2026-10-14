/**
 * Client-side media processing (spec 02 §3.5, AD-30 – AD-34).
 */
import DOMPurify from 'dompurify';
import { formatBytes, RepoError } from '../repository/errors';
import { bucketLimits, checkFileForBucket, extensionFor, VIDEO_WARN_BYTES } from '../repository/limits';
import type { AdminRepository, Bucket } from '../repository/types';

export const MAX_IMAGE_EDGE = 2560;
export const WEBP_QUALITY = 0.85;

/** Scale (w, h) to fit inside max × max, never enlarging. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Removes scripts, event handlers, foreignObject and any external reference (AD-32).
 * Only same-document references (#id) survive in href attributes.
 */
export function sanitizeSvg(svg: string): string {
  const purifier = DOMPurify();
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'href' || data.attrName === 'xlink:href') {
      if (!data.attrValue.trim().startsWith('#')) data.keepAttr = false;
    }
    if (/^on/i.test(data.attrName)) data.keepAttr = false;
    if (data.attrName === 'style' && /url\(\s*['"]?(?!#)/i.test(data.attrValue)) data.keepAttr = false;
  });
  const clean = purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'use'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
  });
  purifier.removeAllHooks();
  if (!/<svg[\s>]/i.test(clean)) throw new RepoError('file', "This SVG couldn't be read.");
  return clean;
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

export interface ProcessedImage {
  blob: Blob;
  contentType: string;
  width?: number;
  height?: number;
}

async function decode(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function svgSize(svg: string): { width?: number; height?: number } {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  return {
    width: w ? Math.round(Number(w[1])) : undefined,
    height: h ? Math.round(Number(h[1])) : undefined,
  };
}

/**
 * Raster images are resized to ≤ 2560 px and re-encoded as WebP (quality 0.85).
 * SVGs are sanitised. If the browser can't produce WebP, the original is kept (within limits).
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const type = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
  if (!bucketLimits.images.types.includes(type)) {
    throw new RepoError('file', `Only ${bucketLimits.images.label} images can be uploaded.`);
  }

  if (type === 'image/svg+xml') {
    const clean = sanitizeSvg(await file.text());
    const blob = new Blob([clean], { type });
    checkFileForBucket('images', blob.size, type);
    return { blob, contentType: type, ...svgSize(clean) };
  }

  const img = await decode(file);
  try {
    const size = fitWithin(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, 0, 0, size.width, size.height);
    const webp = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (webp && webp.type === 'image/webp') {
      checkFileForBucket('images', webp.size, 'image/webp');
      return { blob: webp, contentType: 'image/webp', ...size };
    }
    // Fallback: keep the original file (AD-30)
    checkFileForBucket('images', file.size, type);
    return { blob: file, contentType: type, width: img.width, height: img.height };
  } finally {
    img.close();
  }
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

export interface VideoCheck {
  contentType: string;
  /** Shown above 4 MB (P-6) */
  warning?: string;
}

export function checkVideo(file: File): VideoCheck {
  const type = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
  checkFileForBucket('videos', file.size, type);
  return {
    contentType: type,
    warning:
      file.size > VIDEO_WARN_BYTES
        ? `This video is ${formatBytes(file.size)}. Clips under ${formatBytes(VIDEO_WARN_BYTES)} load much faster on phones.`
        : undefined,
  };
}

/** Grabs the frame currently shown in a <video> as a WebP poster (AD-34). */
export async function captureFrame(video: HTMLVideoElement): Promise<ProcessedImage> {
  if (!video.videoWidth || !video.videoHeight)
    throw new RepoError('file', 'The video is still loading — try again.');
  const size = fitWithin(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RepoError('file', "Your browser can't capture frames.");
  ctx.drawImage(video, 0, 0, size.width, size.height);
  let blob: Blob | null;
  try {
    blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
  } catch {
    throw new RepoError(
      'file',
      "This video can't be captured (it's hosted on another site). Upload a poster instead.",
    );
  }
  if (!blob) throw new RepoError('file', "Couldn't capture this frame.");
  const contentType = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return { blob, contentType, ...size };
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Stored as <bucket>/<folder>/<uuid>.<ext> (AD-37). */
export function objectPathFor(folder: string, contentType: string): string {
  const ext = extensionFor[contentType] ?? 'bin';
  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'misc';
  return `${safeFolder}/${uuid()}.${ext}`;
}

export function uploadBlob(
  repo: AdminRepository,
  bucket: Bucket,
  folder: string,
  blob: Blob,
  contentType: string,
  opts: { onProgress?: (f: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  return repo.files.upload(bucket, objectPathFor(folder, contentType), blob, { contentType, ...opts });
}
