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
      { path: 'projects/:slug', lazy: () => import('../chapters/ProjectPage') },
      { path: 's/:slug', lazy: () => import('../chapters/SectionPage') },
      { path: 'resume', Component: ResumeRoute },
      ...devRoutes,
      { path: '*', Component: NotFoundPage },
    ],
  },
];

export const router = createBrowserRouter(routes);
