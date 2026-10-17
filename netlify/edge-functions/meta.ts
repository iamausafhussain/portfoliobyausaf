/**
 * Netlify Edge Function: puts the right title, description, preview card and structured data
 * into the HTML of each public page (spec 09 SEO-1, SEO-2, SEO-5). On any problem the page is
 * served unchanged, so the site never breaks because of this.
 */
import {
  headTags,
  homeMeta,
  injectHead,
  productMeta,
  projectMeta,
  routeOf,
  simpleMeta,
  summary,
  type PageMeta,
  type Settings,
} from './lib/seo.ts';
import { one, supabaseEnv } from './lib/supabase.ts';

interface Context {
  next(): Promise<Response>;
}

const enc = encodeURIComponent;

async function metaFor(pathname: string, origin: string): Promise<PageMeta | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const s = await one<Settings>(
    'site_settings?select=display_name,tagline,bio_short,portrait,socials,seo&limit=1',
  );
  if (!s) return null;
  const route = routeOf(pathname);
  switch (route.kind) {
    case 'home':
      return homeMeta(s, origin, env.url);
    case 'project': {
      const p = await one<Parameters<typeof projectMeta>[0]>(
        `projects?select=slug,title,summary,cover,year&slug=eq.${enc(route.slug)}&is_published=eq.true`,
      );
      return p
        ? projectMeta(p, s, origin, env.url)
        : simpleMeta('Scene not found', '', pathname, s, origin, { noindex: true });
    }
    case 'product': {
      const p = await one<Parameters<typeof productMeta>[0]>(
        `products?select=slug,title,tagline,description,cover,is_free,price_usd,price_inr&slug=eq.${enc(route.slug)}&is_published=eq.true`,
      );
      return p
        ? productMeta(p, s, origin, env.url)
        : simpleMeta('Product not found', '', pathname, s, origin, { noindex: true });
    }
    case 'section': {
      const sec = await one<{ name: string; intro: string }>(
        `custom_sections?select=name,intro&slug=eq.${enc(route.slug)}&is_published=eq.true&has_page=eq.true`,
      );
      return sec
        ? simpleMeta(sec.name, sec.intro || `${sec.name} by ${s.display_name}`, pathname, s, origin)
        : simpleMeta('Scene not found', '', pathname, s, origin, { noindex: true });
    }
    case 'shop':
      return simpleMeta(
        'Box Office',
        `Presets, LUTs and guides by ${s.display_name}. Instant download after checkout.`,
        '/shop',
        s,
        origin,
      );
    case 'policy': {
      const page = await one<{ title: string; body: string }>(
        `shop_pages?select=title,body&slug=eq.${route.slug}&is_published=eq.true`,
      );
      return page
        ? simpleMeta(page.title, summary(page.body.replace(/^>.*$/m, '')), pathname, s, origin)
        : null;
    }
    default:
      return null;
  }
}

export default async function handler(request: Request, context: Context): Promise<Response> {
  const response = await context.next();
  try {
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
    const url = new URL(request.url);
    const meta = await metaFor(url.pathname, url.origin);
    if (!meta) return response;
    const s = await one<Settings>('site_settings?select=display_name&limit=1');
    const html = injectHead(await response.text(), headTags(meta, s?.display_name ?? ''));
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, { status: response.status, headers });
  } catch {
    return response;
  }
}

export const config = {
  path: ['/', '/projects/*', '/shop', '/shop/*', '/s/*', '/terms', '/refunds', '/privacy'],
  excludedPath: ['/shop/thanks', '/shop/demo-checkout', '/assets/*'],
};
