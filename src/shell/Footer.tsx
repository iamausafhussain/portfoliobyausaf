/** Footer: socials, availability, shop policies, Lite mode, small admin link (spec 03 NV-5). */
import { Link } from 'react-router';
import { PolicyLinks } from '../chapters/shop/PolicyLinks';
import { usePublishedProducts, useSiteSettings } from '../data/queries/public';
import { LiteSwitch } from './LiteSwitch';
import styles from './shell.module.css';

export const socialNames: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  instagram: 'Instagram',
  x: 'X',
};

export function Footer() {
  const settings = useSiteSettings();
  const s = settings.data;
  // the shop's Terms / Refunds / Privacy links, once there's a shop (spec 08 AD-8.6)
  const hasShop = (usePublishedProducts().data?.length ?? 0) > 0;
  const name = s?.display_name ?? 'Ausaf Hussain';
  const socials = Object.entries(s?.socials ?? {}).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerName}>
          <p className={styles.footerTitle}>{name}</p>
          {s?.available_for_work && (
            <p className={styles.available}>
              <span className={styles.availableDot} aria-hidden /> Available for work
            </p>
          )}
        </div>

        {socials.length > 0 && (
          <ul className={styles.socials} aria-label="Elsewhere">
            {socials.map(([key, url]) => (
              <li key={key}>
                <a href={url} target="_blank" rel="noopener me">
                  {socialNames[key] ?? key}
                </a>
              </li>
            ))}
          </ul>
        )}

        {hasShop && <PolicyLinks />}
        <div className={styles.footerBottom}>
          <LiteSwitch />
          <p className={styles.footerSmall}>
            © {new Date().getFullYear()} {name} ·{' '}
            <Link to="/admin" rel="nofollow" className={styles.adminLink}>
              Admin
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
