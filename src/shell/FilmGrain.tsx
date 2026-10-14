/**
 * Film grain overlay (spec 03 MO-2): one small noise tile drawn once, then shifted in
 * steps by CSS (no per-frame JavaScript). Animated on high, still on mid, off on low and
 * with reduced motion (handled in CSS via data-tier and the media query).
 */
import { useEffect, useState } from 'react';

const SIZE = 160;

function makeTile(): string {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function FilmGrain() {
  const [tile, setTile] = useState('');
  useEffect(() => {
    // drawn off the critical path
    const id = setTimeout(() => setTile(makeTile()), 300);
    return () => clearTimeout(id);
  }, []);
  if (!tile) return null;
  return <div className="film-grain" style={{ backgroundImage: `url(${tile})` }} aria-hidden />;
}
