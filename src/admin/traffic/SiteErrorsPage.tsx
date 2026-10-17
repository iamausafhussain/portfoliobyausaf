/** Admin → Site errors (spec 09 OP-3): errors visitors ran into, grouped, newest first. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useToast } from '../ui/feedback';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';
import type { ErrorGroup } from './report';
import { trafficKeys } from './TrafficPage';
import styles from './traffic.module.css';

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function ErrorItem({ e }: { e: ErrorGroup }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = async () => {
    try {
      await repo.analytics.resolveError(e.fingerprint, !e.resolved);
      await qc.invalidateQueries({ queryKey: [...trafficKeys.all, 'errors'] });
    } catch (err) {
      toast.error(isRepoError(err) ? err.message : 'Couldn’t update.');
    }
  };
  return (
    <li className={styles.error} data-error={e.message} data-resolved={e.resolved}>
      <div className={styles.errorHead}>
        <span className={styles.errorMessage}>{e.message}</span>
        <span className={styles.errorCount}>
          {e.count} {e.count === 1 ? 'time' : 'times'}
        </span>
      </div>
      <p className={styles.errorMeta}>
        <span>Last {when(e.last_seen)}</span>
        <span>First {when(e.first_seen)}</span>
        {e.path && <span>on {e.path}</span>}
        {e.browser && <span>{e.browser}</span>}
        {e.release && <span>build {e.release}</span>}
      </p>
      {e.stack && (
        <details>
          <summary className={ui.help}>Details</summary>
          <pre className={styles.stack}>{e.stack}</pre>
        </details>
      )}
      <div className={styles.errorActions}>
        <Button size="small" onClick={() => void toggle()}>
          {e.resolved ? 'Reopen' : 'Mark as fixed'}
        </Button>
      </div>
    </li>
  );
}

export function SiteErrorsPage() {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: [...trafficKeys.all, 'errors'],
    queryFn: () => repo.analytics.errors(),
    staleTime: 0,
  });
  const rows = q.data ?? [];
  const resolved = rows.filter((e) => e.resolved).length;

  const clear = async () => {
    try {
      const n = await repo.analytics.clearResolvedErrors();
      toast.success(`Cleared ${n} fixed ${n === 1 ? 'error' : 'errors'}.`);
      await qc.invalidateQueries({ queryKey: [...trafficKeys.all, 'errors'] });
    } catch (err) {
      toast.error(isRepoError(err) ? err.message : 'Couldn’t clear.');
    }
  };

  return (
    <>
      <PageHeader
        title="Site errors"
        description="Problems visitors' browsers ran into, grouped by message. Nothing personal is sent: just the error, the page, the browser and the build."
        actions={
          resolved > 0 && (
            <Button variant="ghost" icon="trash" onClick={() => void clear()}>
              Clear fixed ({resolved})
            </Button>
          )
        }
      />
      <PageBody>
        {q.isError ? (
          <Notice tone="error">{isRepoError(q.error) ? q.error.message : 'Couldn’t load errors.'}</Notice>
        ) : q.isPending ? (
          <Skeleton height="8rem" />
        ) : rows.length === 0 ? (
          <Notice tone="info">No errors reported. 🎬 That&rsquo;s a clean take.</Notice>
        ) : (
          <ul className={styles.errors}>
            {rows.map((e) => (
              <ErrorItem key={e.fingerprint} e={e} />
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
