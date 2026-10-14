import type { ImgHTMLAttributes } from 'react';
import type { ImageRef } from '../data/schemas';
import { publicMediaUrl } from '../data/source';

/** An image from the content store, with its alt text and size (prevents layout shift, P-5). */
export function Img({
  image,
  ...rest
}: { image: ImageRef } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  const src = publicMediaUrl(image.path);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
}
