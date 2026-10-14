/**
 * Tracks files uploaded while a form is open. When the form is saved they are committed;
 * if the form is abandoned they are deleted again (unless something else uses them).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { removeIfUnused } from '../data/files';
import { useRepository } from '../repository';

interface MediaSession {
  /** Folder for this form's uploads, e.g. "projects". */
  folder: string;
  track(path: string): void;
  commit(): void;
  /** Number of uploads in progress — saving waits until this is 0. */
  uploading: number;
  begin(): void;
  end(): void;
}

const Ctx = createContext<MediaSession | null>(null);

export function MediaSessionProvider({ folder, children }: { folder: string; children: ReactNode }) {
  const repo = useRepository();
  const pending = useRef(new Set<string>());
  const [uploading, setUploading] = useState(0);
  const begin = useCallback(() => setUploading((n) => n + 1), []);
  const end = useCallback(() => setUploading((n) => Math.max(0, n - 1)), []);

  const session = useMemo<MediaSession>(
    () => ({
      folder,
      track: (p) => pending.current.add(p),
      commit: () => pending.current.clear(),
      uploading,
      begin,
      end,
    }),
    [folder, uploading, begin, end],
  );

  useEffect(() => {
    const set = pending.current;
    return () => {
      if (set.size) void removeIfUnused(repo, [...set]);
    };
  }, [repo]);

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useMediaSession(): MediaSession {
  return (
    useContext(Ctx) ?? {
      folder: 'misc',
      track: () => {},
      commit: () => {},
      uploading: 0,
      begin: () => {},
      end: () => {},
    }
  );
}
