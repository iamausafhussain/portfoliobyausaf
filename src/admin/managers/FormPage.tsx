/** Generic create/edit page (spec 02 AD-20 – AD-25). */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { droppedFiles, fileRefs, removeIfUnused } from '../data/files';
import { useAdminRow, useCreateRow, useRemoveRow, useUpdateRow } from '../data/hooks';
import { MediaSessionProvider, useMediaSession } from '../media/MediaSession';
import { useRepository } from '../repository';
import { isRepoError, labelFor } from '../repository/errors';
import type { Row, Values } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useIsDirty } from '../shell/useIsDirty';
import { useUnsavedChanges } from '../shell/useUnsavedChanges';
import { useConfirm, useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton, StatusBadge, ui } from '../ui/primitives';
import { toFormValues, type ManagerConfig } from './types';
import styles from './form.module.css';

/** Flatten nested RHF errors into [{ name, message }] (for the summary). */
export function flattenErrors(errors: FieldErrors, prefix = ''): { name: string; message: string }[] {
  const out: { name: string; message: string }[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (!value || key === 'ref' || key === 'root') continue;
    const name = prefix ? `${prefix}.${key}` : key;
    const v = value as { message?: unknown; type?: unknown };
    if (typeof v.message === 'string' && typeof v.type === 'string') out.push({ name, message: v.message });
    else if (typeof value === 'object') out.push(...flattenErrors(value as FieldErrors, name));
  }
  return out;
}

const humanName = (name: string) =>
  name
    .split('.')
    .filter((p) => !/^\d+$/.test(p))
    .map(labelFor)
    .join(' › ');

function ErrorSummary({
  errors,
  onJump,
}: {
  errors: { name: string; message: string }[];
  onJump: (n: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [errors.length]);
  if (!errors.length) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={styles.summary}
      role="alert"
      aria-labelledby="error-summary-title"
    >
      <p id="error-summary-title" className={styles.summaryTitle}>
        <Icon name="alert" /> Fix {errors.length === 1 ? 'this' : `these ${errors.length}`} before saving
      </p>
      <ul>
        {errors.map((e) => (
          <li key={e.name}>
            <button type="button" className={styles.summaryLink} onClick={() => onJump(e.name)}>
              {humanName(e.name)}: {e.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface EditorProps {
  config: ManagerConfig;
  row: Row | null;
  basePath: string;
  header?: { back?: { to: string; label: string }; eyebrow?: ReactNode };
  onSaved?: (row: Row) => void;
}

function Editor({ config, row, basePath, header, onSaved }: EditorProps) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const media = useMediaSession();
  const create = useCreateRow(config.table);
  const update = useUpdateRow(config.table);
  const remove = useRemoveRow(config.table);
  const [saved, setSaved] = useState<Row | null>(row);
  const [summary, setSummary] = useState<{ name: string; message: string }[]>([]);
  const [conflict, setConflict] = useState(false);
  const [action, setAction] = useState<'save' | 'publish' | null>(null);

  const defaults = useMemo(
    () => (row ? toFormValues(row) : { ...config.newValues(), ...config.fixed }),
    [row, config],
  );
  const form = useForm<Values>({
    defaultValues: defaults,
    resolver: zodResolver(config.schema as never) as unknown as Resolver<Values>,
    mode: 'onTouched',
    // focus goes to the error summary instead (spec 02 §3.9)
    shouldFocusError: false,
  });
  const { handleSubmit, formState, reset, setError, setFocus, control } = form;
  const busy = create.isPending || update.isPending;
  const [baseline, setBaseline] = useState<Values>(defaults);
  const dirty = useIsDirty(control, baseline);

  const { allowNextNavigation } = useUnsavedChanges(dirty && !formState.isSubmitting && !busy);

  const jump = (name: string) => {
    try {
      setFocus(name);
    } catch {
      /* not focusable */
    }
    const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const save = async (values: Values, opts: { force?: boolean; publish?: boolean } = {}) => {
    const { force = false, publish = false } = opts;
    if (media.uploading > 0) {
      toast.error('Wait for the upload to finish, then save.');
      return;
    }
    setSummary([]);
    setAction(publish ? 'publish' : 'save');
    const payload = { ...values, ...config.fixed };
    if (publish) payload.is_published = true;
    try {
      if (
        saved &&
        config.beforeSave &&
        !(await config.beforeSave({ values: payload, saved, repo, confirm }))
      ) {
        return;
      }
      let result: Row;
      if (saved) {
        result = await update.mutateAsync({
          id: saved.id,
          values: payload,
          expectedUpdatedAt: force ? null : saved.updated_at,
        });
        void removeIfUnused(repo, droppedFiles(saved, result));
      } else {
        result = await create.mutateAsync(payload);
      }
      media.commit();
      setConflict(false);
      setSaved(result);
      reset(toFormValues(result));
      setBaseline(toFormValues(result));
      toast.success(publish ? 'Saved and published.' : 'Saved.');
      onSaved?.(result);
      if (!saved) {
        allowNextNavigation();
        navigate(`${basePath}/${result.id}`, { replace: true });
      }
    } catch (e) {
      if (isRepoError(e)) {
        if (e.kind === 'conflict') setConflict(true);
        else if (e.kind === 'auth') {
          toast.error(e.message);
          allowNextNavigation();
          navigate('/admin/login', { state: { next: window.location.pathname } });
        } else if (e.field && e.field in values) {
          setError(e.field, { type: 'server', message: e.message });
          setSummary([{ name: e.field, message: e.message }]);
        } else
          toast.error(
            e.message,
            e.kind === 'network' ? { label: 'Retry', onClick: () => void save(values, opts) } : undefined,
          );
      } else toast.error('Something went wrong. Please try again.');
    } finally {
      setAction(null);
    }
  };

  const onInvalid = (errors: FieldErrors) => {
    const list = flattenErrors(errors);
    setSummary(list);
  };

  const submit = handleSubmit((v) => save(v), onInvalid);
  const submitAndPublish = handleSubmit((v) => save(v, { publish: true }), onInvalid);

  const reload = async () => {
    if (!saved) return;
    const fresh = await repo.data.get(config.table, saved.id);
    if (fresh) {
      setSaved(fresh);
      reset(toFormValues(fresh));
      setBaseline(toFormValues(fresh));
      setConflict(false);
      toast.success('Loaded the latest version.');
    }
  };

  const del = async () => {
    if (!saved) return;
    const details = config.deleteDetails ? await config.deleteDetails(saved, repo) : null;
    const ok = await confirm({
      title: `Delete “${config.title(saved)}”?`,
      body: (
        <>
          {details}
          <p>This can&rsquo;t be undone. Files used only by this {config.singular} are deleted too.</p>
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(saved.id);
      void removeIfUnused(repo, fileRefs(saved));
      toast.success(`Deleted ${config.title(saved)}.`);
      allowNextNavigation();
      navigate(basePath, { replace: true });
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Could not delete.');
    }
  };

  const Form = config.Form;
  const title = saved ? config.title(saved) : `New ${config.singular}`;

  return (
    <FormProvider {...form}>
      <PageHeader
        title={title}
        eyebrow={header?.eyebrow ?? (saved ? `Edit ${config.singular}` : undefined)}
        back={header?.back ?? { to: basePath, label: config.plural }}
        actions={saved ? <StatusBadge published={!!saved.is_published} /> : undefined}
      />
      <PageBody>
        {conflict && (
          <Notice
            tone="warn"
            action={
              <span className={styles.conflictActions}>
                <Button size="small" onClick={reload}>
                  Reload
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  onClick={handleSubmit((v) => save(v, { force: true }), onInvalid)}
                >
                  Overwrite anyway
                </Button>
              </span>
            }
          >
            This {config.singular} was changed somewhere else since you opened it. Reload to see the latest
            version, or overwrite it with yours.
          </Notice>
        )}
        <ErrorSummary errors={summary} onJump={jump} />
        <form className={styles.form} onSubmit={submit} noValidate>
          <Form row={saved} />
          <div className={styles.saveBar}>
            <div className={styles.saveInfo}>
              {dirty ? (
                <span className={ui.help}>Unsaved changes</span>
              ) : saved ? (
                <span className={ui.help}>All changes saved</span>
              ) : null}
            </div>
            <div className={styles.saveActions}>
              {saved && (
                <Button variant="ghost" icon="trash" onClick={del}>
                  Delete
                </Button>
              )}
              {!saved?.is_published && (
                <Button
                  onClick={() => void submitAndPublish()}
                  busy={busy && action === 'publish'}
                  disabled={media.uploading > 0}
                >
                  Save &amp; publish
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                busy={(busy && action !== 'publish') || media.uploading > 0}
              >
                {media.uploading > 0 ? 'Waiting for upload…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </FormProvider>
  );
}

/** Loads the row (if editing) and renders the editor. */
export function FormPage({
  config,
  id,
  basePath,
  header,
}: {
  config: ManagerConfig;
  id?: string;
  basePath: string;
  header?: EditorProps['header'];
}) {
  const query = useAdminRow(config.table, id);
  if (id && query.isPending) {
    return (
      <PageBody>
        <Skeleton height="2.5rem" width="50%" />
        <Skeleton height="16rem" />
      </PageBody>
    );
  }
  if (id && (query.isError || !query.data)) {
    return (
      <PageBody>
        <Notice tone="error">This {config.singular} doesn&rsquo;t exist any more.</Notice>
      </PageBody>
    );
  }
  return (
    <MediaSessionProvider folder={config.mediaFolder}>
      <Editor
        key={id ?? 'new'}
        config={config}
        row={query.data ?? null}
        basePath={basePath}
        header={header}
      />
    </MediaSessionProvider>
  );
}
