import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// demo mode only: lets end-to-end tests refresh public data after changing the demo backend
if (import.meta.env.DEV && import.meta.env.VITE_DEMO === '1' && typeof window !== 'undefined') {
  (window as unknown as { __queryClient: QueryClient }).__queryClient = queryClient;
}
