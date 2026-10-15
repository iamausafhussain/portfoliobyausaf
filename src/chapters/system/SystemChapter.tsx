/**
 * The System (spec 05 §2.4): the globe and the projects.
 *  - 3D version: the globe forms as the chapter scrolls in; a pinned tour stops at each
 *    featured project (CSS sticky, no scroll hijacking), then the "All projects" grid.
 *  - Non-3D version (low tier, Lite, reduced motion, no WebGL): a still globe and the
 *    same cards as a normal list (TF-1 – TF-3).
 * All meaning lives in the DOM cards; the globe is decoration (`aria-hidden`).
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { usePublishedProjects } from '../../data/queries/public';
import type { Project } from '../../data/schemas';
import { useDeviceTier } from '../../device/DeviceProvider';
import { getLenis } from '../../motion/MotionProvider';
import { MAX_STOPS, stopAt } from '../../scene/globe/geo';
import { useStage } from '../../scene/stage/StageProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { SceneBoundary } from '../hero/SceneBoundary';
import { GlobeHandle, type GlobeItem } from './globeHandle';
import { ProjectCard, projectAnchor } from './ProjectCard';
import stillDark from '../../scene/globe/data/globe-dark.webp?url';
import stillLight from '../../scene/globe/data/globe-light.webp?url';
import styles from './system.module.css';

const GlobeScene = lazy(() => import('../../scene/globe/GlobeScene'));

/** Featured first, then the rest, each in display order (SY-2). */
function ordered(list: Project[]): Project[] {
  return [...list.filter((p) => p.is_featured), ...list.filter((p) => !p.is_featured)];
}

function scrollToY(y: number) {
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(y, { duration: 0.9 });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

export function SystemChapter() {
  const q = usePublishedProjects();
  const projects = useMemo(() => q.data ?? [], [q.data]);
  const { stage, capable } = useStage();
  const { tier } = useDeviceTier();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [globeFailed, setGlobeFailed] = useState(false);
  const [handle] = useState(() => new GlobeHandle());
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [stop, setStop] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const motion = capable && !globeFailed;
  const featured = useMemo(() => projects.filter((p) => p.is_featured).slice(0, MAX_STOPS), [projects]);
  const tour = motion && featured.length > 0;
  const items = useMemo<GlobeItem[]>(
    () => projects.map((p) => ({ id: p.id, title: p.title, featured: p.is_featured, globe: p.globe })),
    [projects],
  );
  const all = useMemo(() => ordered(projects), [projects]);
  const tourIds = new Set(tour ? featured.map((p) => p.id) : []);

  // which tour stop is showing (SY-1)
  useEffect(() => {
    if (!tour) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = tourRef.current;
      if (!el) return;
      const span = el.offsetHeight / (featured.length + 1);
      const scrolled = -el.getBoundingClientRect().top;
      setStop(stopAt(scrolled, span, featured.length));
      // past the tour: the globe idles while the grid scrolls by
      const past = scrolled > span * featured.length;
      handle.focus(past ? null : (featured[stopAt(scrolled, span, featured.length)]?.id ?? null));
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
  }, [tour, featured, handle]);

  // no tour: the globe idles
  useEffect(() => {
    if (!tour) handle.focus(null);
  }, [tour, handle]);

  // hovering a card or a node lights it on the globe (SY-3)
  useEffect(() => {
    handle.hover(hoverId);
  }, [hoverId, handle]);

  // the node label follows its node every drawn frame
  useEffect(
    () =>
      handle.onFrame(() => {
        const el = labelRef.current;
        if (!el) return;
        const id = el.dataset.id;
        const s = id ? handle.screenOf(id) : null;
        if (!s || !s.visible) {
          el.dataset.show = '';
          return;
        }
        const slot = slotRef.current?.getBoundingClientRect();
        el.style.transform = `translate(${s.x - (slot?.left ?? 0)}px, ${s.y - (slot?.top ?? 0)}px)`;
        el.dataset.show = '1';
      }),
    [handle],
  );

  const titleOf = (id: string) =>
    id === 'home' ? 'Home · Bhubaneswar' : projects.find((p) => p.id === id)?.title;
  const showLabel = (id: string | null) => {
    const el = labelRef.current;
    if (!el) return;
    el.dataset.id = id ?? '';
    el.textContent = id ? (titleOf(id) ?? '') : '';
    if (!id) el.dataset.show = '';
  };

  /* ---------- pointer on the globe: hover, click, drag (SY-3, SY-4) ---------- */
  const drag = useRef<{ x: number; y: number; moved: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.dragging = '1';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      handle.drag(dx, dy);
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const id = handle.pick(e.clientX, e.clientY);
    const slot = e.currentTarget;
    if (id && id !== 'home') {
      slot.dataset.cursor = 'view';
      slot.dataset.cursorLabel = 'Open';
    } else {
      slot.dataset.cursor = 'drag';
      delete slot.dataset.cursorLabel;
    }
    if (id !== hoverId) {
      setHoverId(id === 'home' ? null : id);
      showLabel(id);
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    delete e.currentTarget.dataset.dragging;
    handle.release();
    if (d.moved < 5) {
      // a click, not a drag: open the node under the pointer
      const id = handle.pick(e.clientX, e.clientY);
      const p = id ? projects.find((x) => x.id === id) : undefined;
      if (p) void navigate(`/projects/${p.slug}`, { viewTransition: true });
    }
  };

  /* ---------- keyboard: focusing a tour card brings its stop into view (SY-5) ---------- */
  const goToStop = (i: number) => {
    const el = tourRef.current;
    if (!el || i === stop) return;
    const span = el.offsetHeight / (featured.length + 1);
    const top = el.getBoundingClientRect().top + scrollY;
    scrollToY(top + span * (i + 0.5));
  };

  const still = theme === 'dark' ? stillDark : stillLight;

  if (q.isPending) {
    return (
      <div className={styles.skeleton} aria-hidden>
        <span />
        <span />
      </div>
    );
  }
  if (q.isError) return <p className={styles.muted}>This chapter couldn&rsquo;t load right now.</p>;

  const globeSlot = (
    <div
      ref={slotRef}
      className={styles.slot}
      data-cursor={motion ? 'drag' : undefined}
      data-globe-slot
      aria-hidden
      onPointerDown={motion ? onPointerDown : undefined}
      onPointerMove={motion ? onPointerMove : undefined}
      onPointerUp={motion ? endDrag : undefined}
      onPointerCancel={motion ? endDrag : undefined}
      onPointerLeave={() => {
        if (!drag.current) {
          setHoverId(null);
          showLabel(null);
        }
      }}
    >
      {/* without 3D: a still frame of the globe (TF-1) */}
      {!motion && (
        <img
          className={styles.still}
          src={still}
          alt=""
          width={520}
          height={520}
          loading="lazy"
          decoding="async"
          data-globe-still
        />
      )}
      <span ref={labelRef} className={styles.nodeLabel} data-node-label />
    </div>
  );

  return (
    <div ref={rootRef} className={styles.system} data-mode={tour ? 'tour' : motion ? 'globe' : 'still'}>
      {motion && stage && (
        <SceneBoundary onError={() => setGlobeFailed(true)}>
          <Suspense fallback={null}>
            <GlobeScene
              stage={stage}
              handle={handle}
              slotRef={slotRef}
              chapterRef={rootRef}
              items={items}
              tier={tier}
              onFail={() => setGlobeFailed(true)}
            />
          </Suspense>
        </SceneBoundary>
      )}

      {tour ? (
        <div
          ref={tourRef}
          className={styles.tour}
          style={{ '--stops': featured.length } as CSSProperties}
          data-tour
        >
          {/* anchors so a link (or "Back to The System") lands on a stop */}
          {featured.map((p, i) => (
            <span
              key={p.id}
              id={projectAnchor(p.slug)}
              className={styles.anchor}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
          <div className={styles.sticky}>
            {globeSlot}
            <div className={styles.stops}>
              <p className={`label ${styles.counter}`} aria-hidden>
                <span>{String(stop + 1).padStart(2, '0')}</span> / {String(featured.length).padStart(2, '0')}
              </p>
              <ol className={styles.tourList} aria-label="Featured projects">
                {featured.map((p, i) => (
                  <li key={p.id} data-active={i === stop || undefined} data-stop={i}>
                    <ProjectCard
                      project={p}
                      variant="tour"
                      onHover={setHoverId}
                      onFocus={() => goToStop(i)}
                      highlighted={hoverId === p.id}
                    />
                  </li>
                ))}
              </ol>
              <a className={styles.skip} href="#all-projects">
                Skip to all projects ↓
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.globeBlock}>{globeSlot}</div>
      )}

      {projects.length === 0 ? (
        <p className={styles.muted}>Nothing here yet.</p>
      ) : (
        <section className={styles.all} aria-labelledby="all-projects">
          <h3 id="all-projects" className={`label ${styles.allTitle}`} tabIndex={-1}>
            All projects
          </h3>
          <ul className={styles.grid}>
            {all.map((p) => (
              <li key={p.id}>
                <ProjectCard
                  project={p}
                  id={tourIds.has(p.id) ? undefined : projectAnchor(p.slug)}
                  onHover={motion ? setHoverId : undefined}
                  highlighted={hoverId === p.id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
