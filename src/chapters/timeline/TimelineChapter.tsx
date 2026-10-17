/**
 * Timeline — experience and skills (spec 06 §2.5): a video-editor timeline on wider screens
 * (year ruler, role clips on tracks, a playhead that follows the role details as you
 * scroll), a vertical timeline on phones, then skills as tracks with level meters.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Img } from '../../components/Img';
import { usePublishedExperience, usePublishedSkills } from '../../data/queries/public';
import type { Experience, Skill } from '../../data/schemas';
import { getLenis } from '../../motion/MotionProvider';
import { TOP_OFFSET } from '../../motion/scrollTo';
import { formatDuration, formatRange, labelForYearFraction } from '../shared/dates';
import { useMotionAllowed } from '../shared/useMotionAllowed';
import { employmentLabels, layoutTimeline, pct, playheadTime } from './layout';
import styles from './timeline.module.css';

const roleAnchor = (id: string) => `role-${id}`;

/** Skills grouped by category, categories in display order, featured first within each (TL-4). */
export function skillTracks(skills: Skill[]): { category: string; skills: Skill[] }[] {
  const order: string[] = [];
  const byCat = new Map<string, Skill[]>();
  for (const s of skills) {
    if (!byCat.has(s.category)) {
      order.push(s.category);
      byCat.set(s.category, []);
    }
    byCat.get(s.category)!.push(s);
  }
  return order.map((category) => {
    const list = byCat.get(category)!;
    return {
      category,
      skills: [...list.filter((s) => s.is_featured), ...list.filter((s) => !s.is_featured)],
    };
  });
}

function Meter({ level }: { level: number }) {
  return (
    <span className={styles.meter} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-on={n <= level || undefined} />
      ))}
    </span>
  );
}

function scrollToRole(id: string) {
  const el = document.getElementById(roleAnchor(id));
  if (!el) return;
  const panel = document.querySelector<HTMLElement>('[data-edit-timeline]');
  const top = el.getBoundingClientRect().top + scrollY - TOP_OFFSET - (panel?.offsetHeight ?? 0) - 16;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(top, { duration: 1 });
  else window.scrollTo({ top, behavior: 'smooth' });
}

export function TimelineChapter() {
  const exp = usePublishedExperience();
  const sk = usePublishedSkills();
  const motion = useMotionAllowed();
  const roles = useMemo(
    // newest first for reading (TL-3)
    () => [...(exp.data ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [exp.data],
  );
  const layout = useMemo(() => layoutTimeline(roles), [roles]);
  const tracks = useMemo(() => skillTracks(sk.data ?? []), [sk.data]);
  const [active, setActive] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  // the list only exists once both queries have settled (the skeleton shows until then)
  const ready = !exp.isPending && !sk.isPending;

  // the playhead follows the role you're reading (TL-2, TL-5)
  useEffect(() => {
    const list = listRef.current;
    if (!ready || !list || roles.length === 0) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const items = [...list.querySelectorAll<HTMLElement>('[data-role]')];
      const line = innerHeight * 0.5;
      let idx = -1;
      let progress = 0;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.top <= line) {
          idx = i;
          progress = (line - r.top) / Math.max(1, r.height);
        }
      });
      const listRect = list.getBoundingClientRect();
      // vertical (phone) version: how far through the list we are
      list.style.setProperty(
        '--fill',
        String(Math.min(1, Math.max(0, (line - listRect.top) / listRect.height))),
      );
      const role = roles[Math.max(0, idx)]!;
      const clip = layout.clips.find((c) => c.id === role.id);
      const inside = idx >= 0 && listRect.bottom > line * 0.6;
      setActive(inside ? role.id : null);
      if (clip && panelRef.current) {
        const t = playheadTime(clip, idx >= 0 ? progress : 0);
        panelRef.current.style.setProperty('--ph', `${pct(t, layout.from, layout.to).toFixed(3)}%`);
        if (labelRef.current) labelRef.current.textContent = labelForYearFraction(t);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [ready, roles, layout]);

  if (!ready) {
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
        <span />
      </div>
    );
  }
  if (exp.isError && sk.isError)
    return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;
  if (roles.length === 0 && tracks.length === 0) return <p className={styles.muted}>Nothing here yet.</p>;

  const byId = new Map<string, Experience>(roles.map((r) => [r.id, r]));

  return (
    <div className={styles.timeline}>
      {roles.length > 0 && (
        <>
          {/* the edit timeline (TL-1, TL-2): decoration; the role list below carries the same facts */}
          <div
            ref={panelRef}
            className={styles.panel}
            data-edit-timeline
            data-playhead={motion || undefined}
            aria-hidden
            style={{ '--tracks': layout.tracks } as CSSProperties}
          >
            <div className={styles.ruler}>
              {layout.years.map((y) => (
                <span key={y} className={styles.tick} style={{ left: `${pct(y, layout.from, layout.to)}%` }}>
                  {y}
                </span>
              ))}
            </div>
            <div className={styles.tracks}>
              {layout.clips.map((c) => {
                const r = byId.get(c.id)!;
                return (
                  <button
                    key={c.id}
                    type="button"
                    tabIndex={-1}
                    className={styles.clip}
                    data-type={r.employment_type}
                    data-active={active === c.id || undefined}
                    data-clip={c.id}
                    style={
                      {
                        left: `${pct(c.start, layout.from, layout.to)}%`,
                        width: `${pct(c.end, layout.from, layout.to) - pct(c.start, layout.from, layout.to)}%`,
                        '--track': c.track,
                      } as CSSProperties
                    }
                    onClick={() => scrollToRole(c.id)}
                    title={`${r.role} · ${r.company}`}
                  >
                    <span className={styles.clipCompany}>{r.company}</span>
                    <span className={styles.clipRole}>{r.role}</span>
                  </button>
                );
              })}
            </div>
            <span className={styles.playhead}>
              <span ref={labelRef} className={`label ${styles.playheadLabel}`} />
            </span>
          </div>

          {/* role details (TL-3) — the real content */}
          <ol ref={listRef} className={styles.roles}>
            {roles.map((r, i) => (
              <li
                key={r.id}
                id={roleAnchor(r.id)}
                className={styles.role}
                data-role={r.id}
                data-active={active === r.id || undefined}
                data-reveal="up"
                style={{ '--i': i } as CSSProperties}
              >
                <div className={styles.roleHead}>
                  <div className={styles.roleTitle}>
                    {r.logo && <Img image={r.logo} className={styles.logo} />}
                    <div>
                      <h3 className={styles.roleName}>{r.role}</h3>
                      <p className={styles.company}>
                        {[r.company, employmentLabels[r.employment_type], r.location]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <p className={`label ${styles.when}`}>
                    <span>{formatRange(r.start_date, r.end_date)}</span>
                    <span className={styles.duration}>{formatDuration(r.start_date, r.end_date)}</span>
                  </p>
                </div>
                {r.description && <p className={styles.description}>{r.description}</p>}
                {r.highlights.length > 0 && (
                  <ul className={styles.highlights}>
                    {r.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
                {r.tech.length > 0 && (
                  <ul className={styles.tags} aria-label="Tech">
                    {r.tech.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* skills as tracks (TL-4) */}
      {tracks.length > 0 && (
        <section className={styles.skills} aria-labelledby="skills-title">
          <h3 id="skills-title" className={`label ${styles.skillsTitle}`} data-reveal="up">
            Skills
          </h3>
          <ul className={styles.skillTracks}>
            {tracks.map((t, i) => (
              <li
                key={t.category}
                className={styles.skillTrack}
                data-reveal="up"
                style={{ '--i': i } as CSSProperties}
              >
                <span className={`label ${styles.trackName}`}>{t.category}</span>
                <ul className={styles.chips}>
                  {t.skills.map((s) => (
                    <li key={s.id} className={styles.chip} data-featured={s.is_featured || undefined}>
                      <span>{s.name}</span>
                      {s.level != null && (
                        <>
                          <Meter level={s.level} />
                          <span className="sr-only">, level {s.level} of 5</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
