import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomePage } from '../chapters/HomePage';
import { ResumeRoute } from '../chapters/ResumeRoute';
import { NotFoundPage } from './NotFoundPage';
import { PublicLayout } from './PublicLayout';

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/tokens',
        lazy: async () => ({ Component: (await import('../dev/TokenPreview')).TokenPreview }),
      },
      // the demo's stand-in for the payment provider's checkout (spec 08 CO-10)
      ...(import.meta.env.VITE_DEMO === '1'
        ? [{ path: 'shop/demo-checkout', lazy: () => import('../chapters/shop/DemoCheckoutPage') }]
        : []),
    ]
  : [];

export const routes: RouteObject[] = [
  {
    // The admin is a separate lazy chunk (spec 02 §3.1, AC-2.8)
    path: '/admin/*',
    // shown while the admin chunk loads on a direct visit
    HydrateFallback: () => null,
    lazy: async () => ({ Component: (await import('../admin/AdminApp')).Component }),
  },
  {
    path: '/',
    Component: PublicLayout,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: HomePage },
      // detail pages load on demand (they bring the Markdown renderer)
      { path: 'projects/:slug', lazy: () => import('../chapters/project/ProjectPage') },
      { path: 's/:slug', lazy: () => import('../chapters/SectionPage') },
      { path: 'resume', Component: ResumeRoute },
      // Box Office (spec 08)
      { path: 'shop', lazy: () => import('../chapters/shop/ShopPage') },
      { path: 'shop/thanks', lazy: () => import('../chapters/shop/ThanksPage') },
      { path: 'shop/:slug', lazy: () => import('../chapters/shop/ProductPage') },
      { path: 'd/:token', lazy: () => import('../chapters/shop/DownloadPage') },
      ...['terms', 'refunds', 'privacy'].map((path) => ({
        path,
        lazy: () => import('../chapters/shop/PolicyPage'),
      })),
      ...devRoutes,
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export const router = createBrowserRouter(routes);
