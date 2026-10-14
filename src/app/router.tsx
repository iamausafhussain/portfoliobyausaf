import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomePage } from '../chapters/HomePage';
import { NotFoundPage } from './NotFoundPage';
import { RootLayout } from './RootLayout';

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/tokens',
        lazy: async () => ({ Component: (await import('../dev/TokenPreview')).TokenPreview }),
      },
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
    Component: RootLayout,
    HydrateFallback: () => null,
    children: [{ index: true, Component: HomePage }, ...devRoutes, { path: '*', Component: NotFoundPage }],
  },
];

export const router = createBrowserRouter(routes);
