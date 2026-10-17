/**
 * Chapters register themselves here (spec 03 HP-5); the indicator, menu and Fast Lane read
 * the list and the active chapter. Adding a chapter needs no change to the shell.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePublishedCustomSections } from '../data/queries/public';
import { orderChapters, type ChapterEntry } from './chapters';

interface Registry {
  /** Chapters currently on the page */
  mounted: ChapterEntry[];
  active: ChapterEntry | null;
  register(entry: ChapterEntry, el: HTMLElement): () => void;
}

const RegistryContext = createContext<Registry | null>(null);

export function ChapterRegistryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<string, { entry: ChapterEntry; el: HTMLElement }>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);

  const register = useCallback((entry: ChapterEntry, el: HTMLElement) => {
    setEntries((m) => new Map(m).set(entry.id, { entry, el }));
    return () =>
      setEntries((m) => {
        const next = new Map(m);
        if (next.get(entry.id)?.el === el) next.delete(entry.id);
        return next;
      });
  }, []);

  // Active = the chapter crossing the middle of the screen (NV-2)
  useEffect(() => {
    if (entries.size === 0 || typeof IntersectionObserver !== 'function') return;
    const byEl = new Map([...entries.values()].map((v) => [v.el, v.entry.id]));
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) if (r.isIntersecting) setActiveId(byEl.get(r.target as HTMLElement) ?? null);
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const { el } of entries.values()) io.observe(el);
    return () => io.disconnect();
  }, [entries]);

  const mounted = useMemo(
    () => [...entries.values()].map((v) => v.entry).sort((a, b) => a.number - b.number),
    [entries],
  );
  const active = activeId ? (entries.get(activeId)?.entry ?? null) : null;
  const value = useMemo(() => ({ mounted, active, register }), [mounted, active, register]);
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useChapterRegistry(): Registry {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useChapterRegistry must be used inside ChapterRegistryProvider');
  return ctx;
}

/** The home page's chapters, from published sections (used by the home page and the menu). */
export function useHomeChapters(): { chapters: ChapterEntry[]; loading: boolean } {
  const sections = usePublishedCustomSections();
  // sections without published items stay off the home page and the menu (spec 06 CS-4)
  const chapters = useMemo(
    () => orderChapters((sections.data ?? []).filter((s) => s.items.length > 0).map((s) => s.section)),
    [sections.data],
  );
  return { chapters, loading: sections.isPending };
}
