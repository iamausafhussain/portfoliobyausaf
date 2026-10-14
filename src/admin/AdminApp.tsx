/**
 * The admin, loaded as its own lazy chunk at /admin/* (spec 02 §3.1).
 * Never part of the public site's initial download (AC-2.8).
 */
import { useEffect, useState } from 'react';
import { Route, Routes, useParams } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { FullScreenLoader, RequireOwner } from './auth/RequireOwner';
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SetupTwoFactorPage,
  VerifyCodePage,
} from './auth/screens';
import { builtInManagers } from './managers/configs';
import { FormPage } from './managers/FormPage';
import { ListPage } from './managers/ListPage';
import type { ManagerConfig } from './managers/types';
import { AccountPage } from './pages/AccountPage';
import { DashboardPage } from './pages/DashboardPage';
import { MediaPage } from './pages/MediaPage';
import { SettingsPage } from './pages/SettingsPage';
import { loadRepository, RepositoryContext } from './repository';
import type { AdminRepository } from './repository/types';
import { sectionsConfig } from './sections/SectionBuilder';
import { SectionItemFormPage, SectionItemsPage } from './sections/SectionItems';
import { AdminLayout } from './shell/AdminLayout';
import { ConfirmProvider, ToastProvider } from './ui/feedback';
import { installAdminErrorMessages } from './zodErrors';

installAdminErrorMessages();

function ManagerForm({ config }: { config: ManagerConfig }) {
  const { id } = useParams();
  return <FormPage config={config} id={id} basePath={`/admin/${config.path}`} />;
}

const managers: ManagerConfig[] = [...Object.values(builtInManagers), sectionsConfig];

export function Component() {
  const [repo, setRepo] = useState<AdminRepository | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRepository().then((r) => {
      if (cancelled) return;
      // Lets end-to-end tests inspect the in-memory demo backend (dev only).
      if (import.meta.env.DEV && r.kind === 'demo')
        (window as unknown as { __demoRepo: AdminRepository }).__demoRepo = r;
      setRepo(r);
    });
    document.title = 'Admin · Ausaf Hussain';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => {
      cancelled = true;
      robots.remove();
    };
  }, []);

  if (!repo) return <FullScreenLoader label="Loading the admin" />;

  return (
    <RepositoryContext.Provider value={repo}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Routes>
              <Route path="login" element={<LoginPage />} />
              <Route path="login/verify" element={<VerifyCodePage />} />
              <Route path="login/setup-2fa" element={<SetupTwoFactorPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              <Route
                element={
                  <RequireOwner>
                    <AdminLayout />
                  </RequireOwner>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {managers.map((m) => (
                  <Route key={m.path} path={m.path}>
                    <Route index element={<ListPage config={m} />} />
                    <Route path="new" element={<ManagerForm config={m} />} />
                    <Route path=":id" element={<ManagerForm config={m} />} />
                  </Route>
                ))}
                <Route path="sections/:id/items" element={<SectionItemsPage />} />
                <Route path="sections/:id/items/new" element={<SectionItemFormPage />} />
                <Route path="sections/:id/items/:itemId" element={<SectionItemFormPage />} />
                <Route path="media" element={<MediaPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="*" element={<DashboardPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </RepositoryContext.Provider>
  );
}
