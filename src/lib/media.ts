/**
 * Turns a stored media path into a URL the browser can load.
 *  - "https://…" (external source) is returned as is.
 *  - "images/projects/2b1f.webp" → <supabase>/storage/v1/object/public/images/projects/2b1f.webp
 *    (first segment is the bucket — spec 01 §3.7).
 */
export const storageBuckets = ['images', 'videos', 'documents'] as const;
export type StorageBucket = (typeof storageBuckets)[number];

export function mediaUrl(path: string, baseUrl: string): string {
  if (/^https:\/\//.test(path)) return path;
  const [bucket, ...rest] = path.split('/');
  if (!bucket || !(storageBuckets as readonly string[]).includes(bucket) || rest.length === 0) {
    throw new Error(`"${path}" is not a storage path (expected images/…, videos/… or documents/…)`);
  }
  const objectPath = rest.map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${objectPath}`;
}
