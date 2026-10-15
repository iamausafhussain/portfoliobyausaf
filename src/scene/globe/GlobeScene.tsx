/**
 * Puts the globe on the shared stage (spec 05 §2.3). Loaded lazily with Three.js and the
 * land-dot data; renders nothing itself.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { GlobeHandle, GlobeItem, GlobeNode } from '../../chapters/system/globeHandle';
import type { Tier } from '../../device/tier';
import type { Stage } from '../stage/Stage';
import landDotsUrl from './data/land-dots.bin?url';
import { HOME, parseLandDots, placeProjects, type LandDots, type LatLng } from './geo';
import { GlobeLayer } from './GlobeLayer';

let dotsPromise: Promise<LandDots> | null = null;
export const loadLandDots = () =>
  (dotsPromise ??= fetch(landDotsUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`land dots: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then(parseLandDots)
    .catch((e: unknown) => {
      dotsPromise = null;
      throw e;
    }));

export default function GlobeScene({
  stage,
  handle,
  slotRef,
  chapterRef,
  items,
  tier,
  onFail,
}: {
  stage: Stage;
  handle: GlobeHandle;
  slotRef: RefObject<HTMLElement | null>;
  chapterRef: RefObject<HTMLElement | null>;
  items: GlobeItem[];
  tier: Tier;
  onFail: () => void;
}) {
  const [layer, setLayer] = useState<GlobeLayer | null>(null);
  const [candidates, setCandidates] = useState<LatLng[] | null>(null);

  // home, then every project at its own spot or an automatic one (GL-2 – GL-4)
  const nodes = useMemo<GlobeNode[]>(() => {
    if (!candidates) return [];
    const spots = placeProjects(items, candidates);
    return [
      { id: HOME.id, kind: 'home', title: HOME.label, lat: HOME.lat, lng: HOME.lng },
      ...items.map((p) => ({
        id: p.id,
        kind: p.featured ? ('featured' as const) : ('project' as const),
        title: p.title,
        ...spots.get(p.id)!,
      })),
    ];
  }, [items, candidates]);

  useEffect(() => {
    let cancelled = false;
    let remove = () => {};
    loadLandDots()
      .then((dots) => {
        const slot = slotRef.current;
        const chapter = chapterRef.current;
        if (cancelled || !slot || !chapter) return;
        const l = new GlobeLayer(stage.renderer, { canvas: stage.canvas, slot, chapter, handle, dots, tier });
        remove = stage.add(l);
        const c: LatLng[] = [];
        for (let i = 0; i < dots.mid.length; i += 2) c.push({ lat: dots.mid[i]!, lng: dots.mid[i + 1]! });
        setCandidates(c);
        setLayer(l);
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) console.warn('[globe] not loaded:', e);
        if (!cancelled) onFail();
      });
    return () => {
      cancelled = true;
      remove();
      setLayer(null);
    };
    // the layer is rebuilt only for a new stage or tier; node changes go through setNodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tier]);

  useEffect(() => {
    if (!layer || !nodes.length) return;
    layer.setNodes(nodes);
    stage.wake();
  }, [layer, nodes, stage]);

  return null;
}
