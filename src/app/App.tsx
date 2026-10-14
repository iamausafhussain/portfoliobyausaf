import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { DeviceProvider } from '../device/DeviceProvider';
import { queryClient } from '../lib/queryClient';
import { ThemeProvider } from '../theme/ThemeProvider';
import { router } from './router';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DeviceProvider>
          <RouterProvider router={router} />
        </DeviceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
