import { Outlet } from 'react-router';

export function RootLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
