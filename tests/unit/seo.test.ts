/** Spec 09 SEO-1 – SEO-5: preview cards, structured data, sitemap, robots, routes. */
import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  headTags,
  homeMeta,
  imageUrl,
  injectHead,
  productMeta,
  projectMeta,
  robotsTxt,
  routeOf,
  safeJson,
  sitemapXml,
  summary,
} from '../../netlify/edge-functions/lib/seo.ts';

const SB = 'https://abc.supabase.co';
const O = 'https://ausafhussain.netlify.app';
const s = {
  display_name: 'Ausaf Hussain',
  tagline: 'Full-stack developer & filmmaker',
  bio_short: 'I build supply-chain software and shoot drone films.',
  portrait: { path: 'images/settings/me.webp', alt: 'Ausaf' },
  socials: { github: 'https://github.com/iamausafhussain', bad: 'javascript:alert(1)' },
  seo: {},
};

describe('pages', () => {
  it('routes addresses', () => {
    expect(routeOf('/')).toEqual({ kind: 'home' });
    expect(routeOf('/projects/edi-pipeline/')).toEqual({ kind: 'project', slug: 'edi-pipeline' });
    expect(routeOf('/shop/drone-luts')).toEqual({ kind: 'product', slug: 'drone-luts' });
    expect(routeOf('/shop/thanks')).toEqual({ kind: 'other' });
    expect(routeOf('/s/talks')).toEqual({ kind: 'section', slug: 'talks' });
    expect(routeOf('/privacy')).toEqual({ kind: 'policy', slug: 'privacy' });
    expect(routeOf('/admin')).toEqual({ kind: 'other' });
  });

  it('home: Person, default share image, description from the tagline', () => {
    const m = homeMeta(s, O, SB);
    expect(m.title).toBe('Ausaf Hussain — Portfolio');
    expect(m.description).toBe('Full-stack developer & filmmaker');
    expect(m.image).toBe(`${O}/og-default.png`);
    expect(m.jsonLd).toMatchObject({
      '@type': 'Person',
      name: 'Ausaf Hussain',
      image: `${SB}/storage/v1/object/public/images/settings/me.webp`,
      sameAs: ['https://github.com/iamausafhussain'],
    });
  });

  it('home: the admin’s SEO fields win', () => {
    const m = homeMeta(
      {
        ...s,
        seo: {
          title: 'Ausaf — films & code',
          description: 'Hi',
          og_image: { path: 'https://cdn.example/x.jpg', alt: 'x' },
        },
      },
      O,
      SB,
    );
    expect([m.title, m.description, m.image]).toEqual([
      'Ausaf — films & code',
      'Hi',
      'https://cdn.example/x.jpg',
    ]);
  });

  it('product: price offers in USD and INR', () => {
    const m = productMeta(
      {
        slug: 'luts',
        title: 'Drone LUTs',
        tagline: '12 looks',
        cover: { path: 'images/shop/luts.webp', alt: 'LUTs' },
        price_usd: 1900,
        price_inr: 149900,
      },
      s,
      O,
      SB,
    );
    expect(m.url).toBe(`${O}/shop/luts`);
    expect(m.jsonLd).toMatchObject({
      '@type': 'Product',
      offers: [
        { price: '19.00', priceCurrency: 'USD' },
        { price: '1499.00', priceCurrency: 'INR' },
      ],
    });
  });

  it('project: CreativeWork with its cover', () => {
    const m = projectMeta(
      { slug: 'edi', title: 'EDI pipeline', summary: 'X12 at scale', cover: null, year: 2025 },
      s,
      O,
      SB,
    );
    expect(m.image).toBe(`${O}/og-default.png`);
    expect(m.jsonLd).toMatchObject({ '@type': 'CreativeWork', dateCreated: '2025' });
  });
});

describe('HTML', () => {
  it('escapes everything and replaces the built-in title and description', () => {
    const html =
      '<html><head><title>Old</title>\n<meta name="description" content="old" />\n</head><body></body></html>';
    const m = productMeta(
      { slug: 'x', title: 'A "quoted" <b>title</b>', tagline: '</script><script>alert(1)</script>' },
      s,
      O,
      SB,
    );
    const out = injectHead(html, headTags(m, 'Ausaf Hussain'));
    expect(out).not.toContain('<title>Old</title>');
    expect(out).not.toContain('content="old"');
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; · Ausaf Hussain</title>');
    expect(out).toContain(
      '<meta property="og:image" content="https://ausafhussain.netlify.app/og-default.png" />',
    );
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(escapeHtml('<&">')).toBe('&lt;&amp;&quot;&gt;');
    expect(safeJson({ a: '</script>' })).toBe('{"a":"\\u003c/script\\u003e"}');
  });

  it('summaries are plain text cut at a word', () => {
    expect(summary('## Hi\n\n**Bold** [link](https://x) text')).toBe('Hi Bold link text');
    const long = summary('word '.repeat(60), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
  });

  it('image URLs follow the storage rule', () => {
    expect(imageUrl({ path: 'images/a b.webp' }, SB)).toBe(
      `${SB}/storage/v1/object/public/images/a%20b.webp`,
    );
    expect(imageUrl({ path: 'products/secret.zip' }, SB)).toBeNull();
    expect(imageUrl(null, SB)).toBeNull();
  });
});

describe('sitemap and robots', () => {
  it('lists each page once with its date', () => {
    const xml = sitemapXml(O, [
      { path: '/' },
      { path: '/shop/luts', updated: '2026-10-10T09:00:00Z' },
      { path: '/' },
    ]);
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain(`<loc>${O}/shop/luts</loc><lastmod>2026-10-10</lastmod>`);
  });
  it('keeps the admin and private pages out', () => {
    const r = robotsTxt(O);
    expect(r).toContain('Disallow: /admin');
    expect(r).toContain('Disallow: /d/');
    expect(r).toContain(`Sitemap: ${O}/sitemap.xml`);
  });
});
