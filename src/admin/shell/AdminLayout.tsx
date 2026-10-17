/** Admin frame: sidebar on desktop, slide-in sheet on phones (spec 02 §3.2). */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useAdminList, useNewMessageCount } from '../data/hooks';
import { useRepository } from '../repository';
import { ThemeToggle } from '../../theme/ThemeToggle';
import { Icon } from '../ui/Icon';
import { IconButton, Notice } from '../ui/primitives';
import { contentNav, shopNav, toolsNav, type NavItem } from './nav';
import styles from './layout.module.css';

function NewMessagesBadge() {
  const count = useNewMessageCount().data ?? 0;
  if (!count) return null;
  return (
    <b className={styles.badge} data-badge>
      {count}
      <span className="sr-only"> new</span>
    </b>
  );
}

function NavLinks({ items, labelledBy }: { items: NavItem[]; labelledBy?: string }) {
  return (
    <ul className={styles.navList} aria-labelledby={labelledBy}>
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? styles.active : undefined)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.badge === 'newMessages' && <NewMessagesBadge />}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Navigation({ onSignOut }: { onSignOut: () => void }) {
  const sections = useAdminList('custom_sections');
  return (
    <nav aria-label="Admin" className={styles.nav}>
      <NavLinks items={contentNav} />
      <p className={`label ${styles.navHeading}`} id="nav-sections">
        Your sections
      </p>
      <ul className={styles.navList} aria-labelledby="nav-sections">
        {(sections.data ?? []).map((s) => (
          <li key={s.id}>
            <NavLink
              to={`/admin/sections/${s.id}/items`}
              className={({ isActive }) => (isActive ? styles.active : undefined)}
            >
              <Icon name="grid" />
              <span>{String(s.name)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink
            to="/admin/sections"
            end
            className={({ isActive }) => (isActive ? styles.active : undefined)}
          >
            <Icon name="plus" />
            <span>Manage sections</span>
          </NavLink>
        </li>
      </ul>
      <p className={`label ${styles.navHeading}`} id="nav-shop">
        Shop
      </p>
      <NavLinks items={shopNav} labelledBy="nav-shop" />
      <div className={styles.navFooter}>
        <NavLinks items={toolsNav} />
        <ul className={styles.navList}>
          <li>
            <a href="/" target="_blank" rel="noreferrer">
              <Icon name="external" />
              <span>View site</span>
            </a>
          </li>
          <li>
            <button type="button" onClick={onSignOut}>
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export function AdminLayout() {
  const repo = useRepository();
  const { state, refresh } = useAuth();
  const navigate = useNavigate();
  const sheet = useRef<HTMLDialogElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const enforced = useQuery({ queryKey: ['admin', 'mfa-enforced'], queryFn: () => repo.auth.mfaEnforced() });

  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (sheetOpen && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!sheetOpen && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [sheetOpen]);

  const signOut = async () => {
    await repo.auth.signOut('local');
    await refresh();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className={styles.frame}>
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>

      <header className={styles.topbar}>
        <IconButton
          icon="menu"
          label="Open menu"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
        />
        <span className={styles.brandSmall}>Admin</span>
        <ThemeToggle className={styles.pushRight} />
      </header>

      <aside className={styles.sidebar}>
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Ausaf Hussain</span>
            <span className="label">Admin</span>
          </div>
          <ThemeToggle />
        </div>
        <Navigation onSignOut={signOut} />
      </aside>

      <dialog
        ref={sheet}
        className={styles.sheet}
        aria-label="Menu"
        onClose={() => setSheetOpen(false)}
        onClick={(e) => {
          // close the phone menu when a link is chosen
          if ((e.target as HTMLElement).closest('a')) setSheetOpen(false);
        }}
      >
        <div className={styles.sheetHead}>
          <span className={styles.brandName}>Ausaf Hussain</span>
          <IconButton icon="close" label="Close menu" onClick={() => setSheetOpen(false)} />
        </div>
        <Navigation onSignOut={signOut} />
      </dialog>

      <main id="admin-main" className={styles.main} tabIndex={-1}>
        <div className={styles.banners}>
          {repo.kind === 'demo' && (
            <Notice>
              <strong>Demo mode.</strong> Changes live in this browser tab only and disappear when you reload.
            </Notice>
          )}
          {repo.kind === 'supabase' && enforced.data === false && (
            <Notice tone="warn">
              <strong>Two-factor isn&rsquo;t enforced by the database yet.</strong> You&rsquo;ve set up your
              authenticator, so now run <code>supabase/migrations/0008_require_mfa.sql</code> in the Supabase
              SQL Editor.
            </Notice>
          )}
        </div>
        <Outlet context={{ email: state?.email }} />
      </main>
    </div>
  );
}
