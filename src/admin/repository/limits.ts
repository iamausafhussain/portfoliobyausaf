/** Bucket limits — must match supabase/migrations/0006_storage.sql and 0010_shop.sql. */
import { formatBytes, RepoError } from './errors';
import type { Bucket } from './types';

export const bucketLimits: Record<Bucket, { maxBytes: number; types: readonly string[]; label: string }> = {
  images: {
    maxBytes: 5 * 1024 * 1024,
    types: ['image/webp', 'image/avif', 'image/jpeg', 'image/png', 'image/svg+xml'],
    label: 'JPEG, PNG, WebP, AVIF or SVG',
  },
  videos: { maxBytes: 15 * 1024 * 1024, types: ['video/mp4', 'video/webm'], label: 'MP4 or WebM' },
  documents: { maxBytes: 5 * 1024 * 1024, types: ['application/pdf'], label: 'PDF' },
  // product files (spec 08 CO-8): any type, up to 50 MB; the bucket is private
  products: { maxBytes: 50 * 1024 * 1024, types: ['*'], label: 'any' },
};

/** Videos above this size get a warning (master spec P-6). */
export const VIDEO_WARN_BYTES = 4 * 1024 * 1024;

/** Throws a RepoError if the file can't go in the bucket. */
export function checkFileForBucket(bucket: Bucket, size: number, contentType: string): void {
  const limit = bucketLimits[bucket];
  if (!limit.types.includes('*') && !limit.types.includes(contentType)) {
    throw new RepoError('file', `Only ${limit.label} files can be uploaded here.`);
  }
  if (size > limit.maxBytes) {
    throw new RepoError(
      'file',
      `This file is ${formatBytes(size)} — the limit is ${formatBytes(limit.maxBytes)}.`,
    );
  }
}

export const extensionFor: Record<string, string> = {
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};
