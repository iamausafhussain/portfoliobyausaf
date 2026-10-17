/**
 * Preview cards, structured data and the sitemap (spec 09 SEO-1 – SEO-5), as pure functions
 * so they can be unit-tested; the Netlify Edge Functions next to this folder do the fetching.
 * Chat apps and most crawlers don't run JavaScript, so these tags must be in the HTML itself.
 */

export interface ImageRef {
  path: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}

export interface Settings {
  display_name: string;
  tagline?: string;
  bio_short?: string;
  portrait?: ImageRef | null;
  socials?: Record<string, string>;
  seo?: { title?: string | null; description?: string | null; og_image?: ImageRef | null };
}

export interface PageMeta {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  type: 'website' | 'article' | 'product' | 'profile';
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const BUCKETS = ['images', 'videos', 'documents'];

/** Public URL of a stored image (same rule as src/lib/media.ts). */
export function imageUrl(img: ImageRef | null | undefined, supabaseUrl: string): string | null {
  if (!img?.path) return null;
  if (/^https:\/\//.test(img.path)) return img.path;
  const [bucket, ...rest] = img.path.split('/');
  if (!bucket || !BUCKETS.includes(bucket) || !rest.length) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${rest.map(encodeURIComponent).join('/')}`;
}

/** Plain text from Markdown-ish text, cut at a word boundary. */
export function summary(text: string | null | undefined, max = 160): string {
  const plain = (text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}…`;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON for a <script> tag: "</script>" and friends can't break out. */
export const safeJson = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export function personLd(s: Settings, origin: string, supabaseUrl: string): Record<string, unknown> {
  const sameAs = Object.values(s.socials ?? {}).filter((u) => /^https:\/\//.test(u));
  const image = imageUrl(s.portrait, supabaseUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: s.display_name,
    url: `${origin}/`,
    ...(s.tagline ? { jobTitle: s.tagline } : {}),
    ...(s.bio_short ? { description: summary(s.bio_short, 300) } : {}),
    ...(image ? { image } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** The tags for one page, given what it shows. */
export function homeMeta(s: Settings, origin: string, supabaseUrl: string): PageMeta {
  return {
    title: s.seo?.title || `${s.display_name} — Portfolio`,
    description: s.seo?.description || summary(s.tagline || s.bio_short) || `${s.display_name}'s portfolio`,
    image: imageUrl(s.seo?.og_image, supabaseUrl) ?? `${origin}/og-default.png`,
    imageAlt: s.seo?.og_image?.alt || `${s.display_name} — Portfolio`,
    url: `${origin}/`,
    type: 'profile',
    jsonLd: personLd(s, origin, supabaseUrl),
  };
}

export function projectMeta(
  p: { slug: string; title: string; summary?: string; cover?: ImageRef | null; year?: number | null },
  s: Settings,
  origin: string,
  supabaseUrl: string,
): PageMeta {
  const image = imageUrl(p.cover, supabaseUrl);
  const url = `${origin}/projects/${p.slug}`;
  return {
    title: `${p.title} · ${s.display_name}`,
    description: summary(p.summary) || `A project by ${s.display_name}`,
    image: image ?? `${origin}/og-default.png`,
    imageAlt: p.cover?.alt || p.title,
    url,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: p.title,
      url,
      ...(p.summary ? { description: summary(p.summary, 300) } : {}),
      ...(image ? { image } : {}),
      ...(p.year ? { dateCreated: String(p.year) } : {}),
      creator: { '@type': 'Person', name: s.display_name, url: `${origin}/` },
    },
  };
}

export function productMeta(
  p: {
    slug: string;
    title: string;
    tagline?: string;
    description?: string;
    cover?: ImageRef | null;
    is_free?: boolean;
    price_usd?: number | null;
    price_inr?: number | null;
  },
  s: Settings,
  origin: string,
  supabaseUrl: string,
): PageMeta {
  const image = imageUrl(p.cover, supabaseUrl);
  const url = `${origin}/shop/${p.slug}`;
  const offers = p.is_free
    ? [
        {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url,
        },
      ]
    : [
        ...(p.price_usd != null
          ? [
              {
                '@type': 'Offer',
                price: (p.price_usd / 100).toFixed(2),
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
                url,
              },
            ]
          : []),
        ...(p.price_inr != null
          ? [
              {
                '@type': 'Offer',
                price: (p.price_inr / 100).toFixed(2),
                priceCurrency: 'INR',
                availability: 'https://schema.org/InStock',
                url,
              },
            ]
          : []),
      ];
  return {
    title: `${p.title} · ${s.display_name}`,
    description: summary(p.tagline || p.description) || `A digital product by ${s.display_name}`,
    image: image ?? `${origin}/og-default.png`,
    imageAlt: p.cover?.alt || p.title,
    url,
    type: 'product',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      url,
      description: summary(p.tagline || p.description, 300) || p.title,
      ...(image ? { image } : {}),
      brand: { '@type': 'Brand', name: s.display_name },
      ...(offers.length ? { offers } : {}),
    },
  };
}

export function simpleMeta(
  title: string,
  description: string,
  path: string,
  s: Settings,
  origin: string,
  opts: { noindex?: boolean } = {},
): PageMeta {
  return {
    title: `${title} · ${s.display_name}`,
    description: summary(description),
    image: `${origin}/og-default.png`,
    imageAlt: `${s.display_name} — Portfolio`,
    url: `${origin}${path}`,
    type: 'website',
    noindex: opts.noindex,
  };
}

/** The tags, ready for <head>. */
export function headTags(m: PageMeta, siteName: string): string {
  const e = escapeHtml;
  const ogType =
    m.type === 'profile' || m.type === 'product' ? (m.type === 'product' ? 'product' : 'profile') : m.type;
  const tags = [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" />`,
    `<link rel="canonical" href="${e(m.url)}" />`,
    m.noindex ? '<meta name="robots" content="noindex" />' : '',
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="${e(siteName)}" />`,
    `<meta property="og:title" content="${e(m.title)}" />`,
    `<meta property="og:description" content="${e(m.description)}" />`,
    `<meta property="og:url" content="${e(m.url)}" />`,
    `<meta property="og:image" content="${e(m.image)}" />`,
    `<meta property="og:image:alt" content="${e(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(m.title)}" />`,
    `<meta name="twitter:description" content="${e(m.description)}" />`,
    `<meta name="twitter:image" content="${e(m.image)}" />`,
    m.jsonLd ? `<script type="application/ld+json">${safeJson(m.jsonLd)}</script>` : '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

/** Puts the tags into the page, replacing the built-in title and description. */
export function injectHead(html: string, tags: string): string {
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/i, '');
  return cleaned.includes('</head>') ? cleaned.replace('</head>', `    ${tags}\n  </head>`) : cleaned;
}

/* ------------------------------------------------------------------ */
/* Sitemap and robots.txt (SEO-4)                                      */
/* ------------------------------------------------------------------ */

export interface SitemapEntry {
  path: string;
  updated?: string | null;
}

export function sitemapXml(origin: string, entries: SitemapEntry[]): string {
  const seen = new Set<string>();
  const rows = entries
    .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
    .map(
      (e) =>
        `  <url><loc>${escapeHtml(origin + e.path)}</loc>${e.updated ? `<lastmod>${e.updated.slice(0, 10)}</lastmod>` : ''}</url>`,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /d/',
    'Disallow: /shop/thanks',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Which kind of page an address is, for the edge function. */
export type Route =
  | { kind: 'home' }
  | { kind: 'project'; slug: string }
  | { kind: 'product'; slug: string }
  | { kind: 'section'; slug: string }
  | { kind: 'shop' }
  | { kind: 'policy'; slug: 'terms' | 'refunds' | 'privacy' }
  | { kind: 'other' };

export function routeOf(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return { kind: 'home' };
  if (p === '/shop') return { kind: 'shop' };
  let m = /^\/projects\/([a-z0-9-]{1,80})$/.exec(p);
  if (m) return { kind: 'project', slug: m[1]! };
  m = /^\/shop\/([a-z0-9-]{1,80})$/.exec(p);
  if (m && m[1] !== 'thanks' && m[1] !== 'demo-checkout') return { kind: 'product', slug: m[1]! };
  m = /^\/s\/([a-z0-9-]{1,80})$/.exec(p);
  if (m) return { kind: 'section', slug: m[1]! };
  if (p === '/terms' || p === '/refunds' || p === '/privacy')
    return { kind: 'policy', slug: p.slice(1) as 'terms' };
  return { kind: 'other' };
}
