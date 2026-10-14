// @vitest-environment jsdom
/** AC-2.16 — SVG sanitising (DOMPurify needs a DOM, so this file runs in jsdom). */
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../../src/admin/media/pipeline';

describe('sanitizeSvg', () => {
  it('removes scripts, event handlers, external links and foreignObject', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(2)</script>
      <rect width="10" height="10" onclick="alert(3)"/>
      <a href="javascript:alert(4)"><text>x</text></a>
      <image xlink:href="https://evil.example.com/track.png"/>
      <foreignObject><div>html</div></foreignObject>
      <use href="#local"/>
      <circle id="local" r="2" style="fill:url(https://evil.example.com/x)"/>
    </svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain('<rect');
    expect(clean).toContain('<circle');
    for (const bad of [
      '<script',
      'onload',
      'onclick',
      'javascript:',
      'evil.example.com',
      'foreignObject',
      '<use',
    ]) {
      expect(clean, bad).not.toContain(bad);
    }
  });

  it('keeps same-document references', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="1" height="1"/></svg>`;
    expect(sanitizeSvg(svg)).toContain('url(#g)');
  });

  it('rejects files that are not SVG', () => {
    expect(() => sanitizeSvg('<html><script>x</script></html>')).toThrow(/couldn't be read/);
  });
});
