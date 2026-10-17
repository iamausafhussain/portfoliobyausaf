/** About — "The Director" (spec 06 §2.3). */
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { LazyMarkdown } from '../../components/markdown/LazyMarkdown';
import { Img } from '../../components/Img';
import {
  usePublishedAchievements,
  usePublishedExperience,
  usePublishedProjects,
  useSiteSettings,
} from '../../data/queries/public';
import { publicMediaUrl } from '../../data/source';
import { useDeviceTier } from '../../device/DeviceProvider';
import { socialNames } from '../../shell/Footer';
import { readouts, type Readout } from '../shared/readouts';
import { useCountUp } from '../shared/useCountUp';
import { useMotionAllowed } from '../shared/useMotionAllowed';
import styles from './about.module.css';

/** Splits the short bio into sentences so it can reveal line by line (AB-2). */
export function bioLines(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function ReadoutItem({ r, i, animate }: { r: Readout; i: number; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, r.value, animate);
  return (
    <li
      className={styles.readout}
      data-reveal="up"
      style={{ '--i': i } as CSSProperties}
      data-readout={r.key}
    >
      <span className={styles.readoutValue}>
        <span ref={ref}>{r.value}</span>
        {r.suffix}
      </span>
      <span className={`label ${styles.readoutLabel}`}>{r.label}</span>
    </li>
  );
}

/** A gentle parallax of the portrait inside its frame (AB-1), high and mid tiers only. `on`
 * also waits for the content (not the skeleton) to be showing, so the frame exists. */
function useParallax(frame: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = frame.current;
    if (!el || !on) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const centre = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // −1…1 around the middle
      el.style.setProperty('--py', `${(Math.max(-1, Math.min(1, centre)) * -6).toFixed(2)}%`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      el.style.removeProperty('--py');
    };
  }, [frame, on]);
}

export function AboutChapter() {
  const settings = useSiteSettings();
  const experience = usePublishedExperience();
  const projects = usePublishedProjects();
  const achievements = usePublishedAchievements();
  const motion = useMotionAllowed();
  const { tier } = useDeviceTier();
  const frameRef = useRef<HTMLElement>(null);
  useParallax(frameRef, motion && tier !== 'low' && settings.isSuccess);

  const s = settings.data;
  const name = s?.display_name || 'Ausaf Hussain';
  const lines = useMemo(() => bioLines(s?.bio_short ?? ''), [s?.bio_short]);
  const numbers = useMemo(
    () =>
      readouts({
        experience: experience.data ?? [],
        projects: projects.data ?? [],
        achievements: achievements.data ?? [],
      }),
    [experience.data, projects.data, achievements.data],
  );
  const socials = Object.entries(s?.socials ?? {}).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );
  const resume = s?.resume_path ? publicMediaUrl(s.resume_path) : '';

  if (settings.isPending) {
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
        <span />
      </div>
    );
  }
  if (settings.isError) return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;

  return (
    <div className={styles.about}>
      {/* portrait in a film frame (AB-1) */}
      <figure ref={frameRef} className={styles.frame} data-reveal="up">
        <span className={`label ${styles.frameLabel}`} aria-hidden>
          ROLL 01 · FRAME 01
        </span>
        {s?.portrait ? (
          <Img image={s.portrait} className={styles.portrait} />
        ) : (
          <span className={styles.initials} aria-hidden>
            {initials(name)}
          </span>
        )}
        <span className={styles.corners} aria-hidden />
      </figure>

      <div className={styles.text}>
        {lines.length > 0 && (
          <p className={styles.bio}>
            {lines.map((line, i) => (
              <span key={i} className={styles.line} data-reveal="up" style={{ '--i': i } as CSSProperties}>
                {line}{' '}
              </span>
            ))}
          </p>
        )}
        {s?.bio_long?.trim() && (
          <div className={styles.prose} data-reveal="up">
            <LazyMarkdown>{s.bio_long}</LazyMarkdown>
          </div>
        )}

        {/* facts (AB-4) */}
        <ul className={styles.facts} data-reveal="up">
          {s?.location && (
            <li>
              <span className={`label ${styles.factLabel}`}>Based in</span>
              <span>{s.location}</span>
            </li>
          )}
          {s?.available_for_work && (
            <li>
              <span className={styles.available}>
                <span className={styles.availableDot} aria-hidden /> Available for work
              </span>
            </li>
          )}
        </ul>
        {(socials.length > 0 || resume) && (
          <div className={styles.actions} data-reveal="up">
            {resume && (
              <a
                className={styles.resume}
                href={resume}
                target="_blank"
                rel="noopener"
                data-cursor="view"
                data-cursor-label="PDF"
              >
                Download résumé <span aria-hidden>↓</span>
              </a>
            )}
            {socials.length > 0 && (
              <ul className={styles.socials} aria-label="Elsewhere">
                {socials.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener">
                      {socialNames[key] ?? key} <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* readouts (AB-3) */}
      {numbers.length > 0 && (
        <ul className={styles.readouts} aria-label="In numbers">
          {numbers.map((r, i) => (
            <ReadoutItem key={r.key} r={r} i={i} animate={motion} />
          ))}
        </ul>
      )}
    </div>
  );
}
