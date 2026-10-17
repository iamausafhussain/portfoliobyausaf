/**
 * Error reports (spec 09 OP-3): uncaught errors on the public site and the admin go to the
 * database's `report_error` function, grouped there. Only the message, the stack, the page
 * and the build are sent; nothing the visitor typed.
 */
import { getPublicSource } from '../data/source';

export interface ErrorReport {
  message: string;
  stack: string | null;
  path: string;
  release: string;
}

const MAX_PER_PAGE = 5;
let sent = 0;
const seen = new Set<string>();

/** Errors that say nothing useful or aren't ours (extensions, aborted loads). */
export function ignorable(message: string, stack: string | null): boolean {
  return (
    !message ||
    /^Script error\.?$/.test(message) ||
    /ResizeObserver loop/.test(message) ||
    /AbortError|The user aborted a request/.test(message) ||
    /(chrome|moz|safari)-extension:\/\//.test(stack ?? '')
  );
}

export function reportError(error: unknown, path = location.pathname): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`.slice(0, 500);
    const stack = err.stack ? err.stack.slice(0, 4000) : null;
    if (ignorable(message, stack) || sent >= MAX_PER_PAGE || seen.has(message)) return;
    seen.add(message);
    sent += 1;
    const report: ErrorReport = { message, stack, path: path.slice(0, 300), release: __BUILD_ID__ };
    void getPublicSource()
      .then((s) => s.reportError(report))
      .catch(() => undefined);
  } catch {
    /* never throw from the error reporter */
  }
}

/** Listens for uncaught errors; production and demo only (development shows them in the overlay). */
export function installErrorReporting(): void {
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO !== '1') return;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
