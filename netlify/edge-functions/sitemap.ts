/** Netlify Edge Function: sitemap.xml and robots.txt, always current (spec 09 SEO-4). */
import { robotsTxt, sitemapXml, type SitemapEntry } from './lib/seo.ts';
import { rest } from './lib/supabase.ts';

type Row = { slug: string; updated_at: string };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/robots.txt') {
    return new Response(robotsTxt(url.origin), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }
  const [projects, products, sections, pages] = await Promise.all([
    rest<Row[]>('projects?select=slug,updated_at&is_published=eq.true'),
    rest<Row[]>('products?select=slug,updated_at&is_published=eq.true'),
    rest<Row[]>('custom_sections?select=slug,updated_at&is_published=eq.true&has_page=eq.true'),
    rest<Row[]>('shop_pages?select=slug,updated_at&is_published=eq.true'),
  ]);
  const entries: SitemapEntry[] = [
    { path: '/' },
    ...(products?.length ? [{ path: '/shop' }] : []),
    ...(projects ?? []).map((p) => ({ path: `/projects/${p.slug}`, updated: p.updated_at })),
    ...(products ?? []).map((p) => ({ path: `/shop/${p.slug}`, updated: p.updated_at })),
    ...(sections ?? []).map((p) => ({ path: `/s/${p.slug}`, updated: p.updated_at })),
    ...(pages ?? []).map((p) => ({ path: `/${p.slug}`, updated: p.updated_at })),
  ];
  return new Response(sitemapXml(url.origin, entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
  });
}

export const config = { path: ['/sitemap.xml', '/robots.txt'] };
