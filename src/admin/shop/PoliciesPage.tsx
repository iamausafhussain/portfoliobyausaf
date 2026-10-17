/**
 * Shop policies (spec 08 AD-8.6): Terms, Refund policy and Privacy as markdown pages,
 * published at /terms, /refunds and /privacy.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { shopPageRow } from '../../data/schemas/shop';
import { SwitchField, TextField } from '../fields/basic';
import { FieldGroup } from '../fields/media';
import { MarkdownField } from '../fields/MarkdownField';
import formStyles from '../managers/form.module.css';
import listStyles from '../managers/list.module.css';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { ShopPageRow } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useUnsavedChanges } from '../shell/useUnsavedChanges';
import { useToast } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton, StatusBadge, ui } from '../ui/primitives';
import { shopKeys } from './keys';
import styles from './shop.module.css';

const slugs = ['terms', 'refunds', 'privacy'] as const;
type Slug = (typeof slugs)[number];
const tabNames: Record<Slug, string> = { terms: 'Terms', refunds: 'Refund policy', privacy: 'Privacy' };

const pageForm = shopPageRow.pick({ title: true, body: true, is_published: true });
type PageValues = z.infer<typeof pageForm>;

function PageEditor({ page }: { page: ShopPageRow }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const [saved, setSaved] = useState(page);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useForm<PageValues>({
    defaultValues: { title: page.title, body: page.body, is_published: page.is_published },
    resolver: zodResolver(pageForm) as unknown as Resolver<PageValues>,
    mode: 'onTouched',
  });
  const dirty = form.formState.isDirty;
  useUnsavedChanges(dirty && !busy);

  const save = async (values: PageValues, force = false) => {
    setBusy(true);
    try {
      const next = await repo.shop.updatePage(page.slug, values, force ? null : saved.updated_at);
      setSaved(next);
      setConflict(false);
      form.reset({ title: next.title, body: next.body, is_published: next.is_published });
      qc.setQueryData<ShopPageRow[]>(shopKeys.pages, (all) =>
        all?.map((p) => (p.slug === next.slug ? next : p)),
      );
      void qc.invalidateQueries({ queryKey: ['published', 'shop_pages'] });
      toast.success(next.is_published ? `Saved. It's live at /${next.slug}.` : 'Saved as a draft.');
    } catch (e) {
      if (isRepoError(e) && e.kind === 'conflict') setConflict(true);
      else toast.error(isRepoError(e) ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    const all = await repo.shop.pages();
    const fresh = all.find((p) => p.slug === page.slug);
    if (!fresh) return;
    setSaved(fresh);
    setConflict(false);
    form.reset({ title: fresh.title, body: fresh.body, is_published: fresh.is_published });
  };

  const body = useWatch({ control: form.control, name: 'body' });
  const reviewNote = /review before publishing/i.test(body ?? '');

  return (
    <FormProvider {...form}>
      <form
        className={formStyles.form}
        onSubmit={form.handleSubmit((v) => save(v))}
        noValidate
        data-policy={page.slug}
      >
        {conflict && (
          <Notice
            tone="warn"
            action={
              <span className={formStyles.conflictActions}>
                <Button size="small" onClick={() => void reload()}>
                  Reload
                </Button>
                <Button size="small" variant="danger" onClick={form.handleSubmit((v) => save(v, true))}>
                  Overwrite anyway
                </Button>
              </span>
            }
          >
            This page was changed somewhere else since you opened it.
          </Notice>
        )}
        {reviewNote && (
          <Notice tone="warn">
            This is a starting template, not legal advice. Read it, change what doesn&rsquo;t fit how you
            sell, and remove the &ldquo;Review before publishing&rdquo; line when you&rsquo;re happy with it.
          </Notice>
        )}
        <FieldGroup title="Page">
          <SwitchField
            name="is_published"
            label="Published"
            help={`Visible at /${page.slug} and linked from the footer and product pages.`}
          />
          <TextField name="title" label="Title" required max={100} />
          <MarkdownField name="body" label="Text" max={20000} rows={18} />
        </FieldGroup>
        <div className={formStyles.saveBar}>
          <div className={formStyles.saveInfo}>
            <span className={ui.help}>
              {dirty ? 'Unsaved changes' : `Last saved ${new Date(saved.updated_at).toLocaleString()}`}
            </span>
          </div>
          <div className={formStyles.saveActions}>
            {saved.is_published && (
              <a className={styles.viewLink} href={`/${page.slug}`} target="_blank" rel="noreferrer">
                View page <Icon name="external" size={14} />
              </a>
            )}
            <Button type="submit" variant="primary" busy={busy}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

export function PoliciesPage() {
  const repo = useRepository();
  const [params, setParams] = useSearchParams();
  const slug = (slugs.find((s) => s === params.get('page')) ?? 'terms') as Slug;
  const q = useQuery({ queryKey: shopKeys.pages, queryFn: () => repo.shop.pages(), staleTime: 0 });
  const page = q.data?.find((p) => p.slug === slug);

  return (
    <>
      <PageHeader
        title="Shop policies"
        description="Payment providers ask for these before they approve your shop. Buyers see them in the footer and on every product page."
      />
      <PageBody>
        <div className={listStyles.filters} role="tablist" aria-label="Policy page">
          {slugs.map((s) => {
            const p = q.data?.find((x) => x.slug === s);
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={slug === s}
                aria-pressed={slug === s}
                className={listStyles.chip}
                onClick={() => setParams({ page: s }, { replace: true })}
              >
                {tabNames[s]}
                {p && !p.is_published && <span>draft</span>}
              </button>
            );
          })}
        </div>
        {q.isError ? (
          <Notice tone="error">
            {isRepoError(q.error) ? q.error.message : 'Couldn’t load the policy pages.'}
          </Notice>
        ) : q.isPending ? (
          <Skeleton height="20rem" />
        ) : !page ? (
          <Notice tone="warn">This page is missing. Run migration 0010 again (setup guide, step D1).</Notice>
        ) : (
          <>
            <div className={styles.policyHead}>
              <StatusBadge published={page.is_published} />
            </div>
            <PageEditor key={page.slug} page={page} />
          </>
        )}
      </PageBody>
    </>
  );
}
