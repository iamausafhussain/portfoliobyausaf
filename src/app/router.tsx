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

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [{ index: true, Component: HomePage }, ...devRoutes, { path: '*', Component: NotFoundPage }],
  },
]);
