/**
 * Chooses the repository. Demo mode exists only in development: in a production build
 * `import.meta.env.DEV` is the constant `false`, so the demo module is never bundled
 * (checked by tests/unit/adminBundle.test.ts, AC-2.8).
 */
import { createContext, useContext } from 'react';
import { supabaseRepository } from './supabaseRepository';
import type { AdminRepository } from './types';

export const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO === '1';

let demo: Promise<AdminRepository> | null = null;

/**
 * One shared instance per page load, so the demo admin and the demo public site see the
 * same data (spec 03 PD-1).
 */
export async function loadRepository(): Promise<AdminRepository> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO === '1') {
    demo ??= import('./demoRepository').then((m) => {
      const repo = m.createDemoRepository();
      // lets end-to-end tests inspect the in-memory demo backend (dev only)
      (window as unknown as { __demoRepo: AdminRepository }).__demoRepo = repo;
      return repo;
    });
    return demo;
  }
  return supabaseRepository;
}

export const RepositoryContext = createContext<AdminRepository | null>(null);

export function useRepository(): AdminRepository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('useRepository must be used inside the admin');
  return repo;
}
