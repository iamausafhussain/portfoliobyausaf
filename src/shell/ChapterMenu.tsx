/** Full chapter list, as an overlay (spec 03 NV-3). Native <dialog>: focus trap and Esc built in. */
import { useEffect, useRef, useState } from 'react';
import { useMagnetic } from '../cursor/magnetic';
import { Link } from 'react-router';
import { usePublishedCustomSections, useSiteSettings } from '../data/queries/public';
import { publicMediaUrl } from '../data/source';
import { chapterCode } from './chapters';
import { useChapterRegistry, useHomeChapters } from './ChapterRegistry';
import { LiteSwitch } from './LiteSwitch';
import { useNavigateToChapter } from './useNavigateToChapter';
import styles from './shell.module.css';

export function ChapterMenu() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useMagnetic(button);
  const { chapters } = useHomeChapters();
  const { active } = useChapterRegistry();
  const sections = usePublishedCustomSections();
  const settings = useSiteSettings();
  const goTo = useNavigateToChapter();

  // pages of sections with no published items yet stay out of the menu (spec 06 CS-4)
  const pages = (sections.data ?? [])
    .filter((s) => s.items.length > 0)
    .map((s) => s.section)
    .filter((s) => s.show_in_nav && s.has_page);
  const resume = settings.data?.resume_path ? publicMediaUrl(settings.data.resume_path) : '';

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      document.documentElement.classList.add('menu-open');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
    if (!open) document.documentElement.classList.remove('menu-open');
  }, [open]);

  const choose = (id: string) => {
    setOpen(false);
    // let the dialog close (and return focus) before scrolling and focusing the chapter
    requestAnimationFrame(() => goTo(id));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.menuIcon} aria-hidden>
          <span />
          <span />
        </span>
        <span className={styles.menuLabel}>Chapters</span>
      </button>

      <dialog
        ref={dialog}
        className={styles.menu}
        aria-label="Chapters"
        data-lenis-prevent
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // click on the backdrop area closes
          if (e.target === dialog.current) setOpen(false);
        }}
      >
        <div className={styles.menuInner}>
          <div className={styles.menuHead}>
            <p className="label">Chapters</p>
            <button type="button" className={styles.menuClose} onClick={() => setOpen(false)}>
              Close <span aria-hidden>✕</span>
            </button>
          </div>

          <ol className={styles.menuList}>
            {chapters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={styles.menuItem}
                  aria-current={active?.id === c.id ? 'location' : undefined}
                  onClick={() => choose(c.id)}
                >
                  <span className={`label ${styles.menuCode}`}>{chapterCode(c.number)}</span>
                  <span className={styles.menuTitle}>{c.title}</span>
                  {c.kind === 'built-in' && <span className={styles.menuSub}>{c.subtitle}</span>}
                </button>
              </li>
            ))}
          </ol>

          {pages.length > 0 && (
            <div className={styles.menuGroup}>
              <p className="label">Pages</p>
              <ul className={styles.menuPages}>
                {pages.map((s) => (
                  <li key={s.id}>
                    <Link to={`/s/${s.slug}`} onClick={() => setOpen(false)} viewTransition>
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.menuFoot}>
            {resume && (
              <a href={resume} target="_blank" rel="noopener">
                Resume (PDF)
              </a>
            )}
            <LiteSwitch />
          </div>
        </div>
      </dialog>
    </>
  );
}
