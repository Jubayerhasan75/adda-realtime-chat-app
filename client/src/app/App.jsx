import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { UpdateBanner } from '../features/pwa/UpdateBanner.jsx';
import { ThemeProvider } from '../features/settings/ThemeProvider.jsx';
import { createQueryClient } from './queryClient.js';
import { router } from './router.jsx';

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <UpdateBanner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
