/** Products manager (spec 08 AD-8.1, AD-8.2): built on the Part 2 manager. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { productInsert, type ImageRef } from '../../data/schemas';
import { formatPrice, formatSize, productKindLabels } from '../../data/shop';
import { ListField, SelectField, SlugField, SwitchField, TextField, useFieldError } from '../fields/basic';
import { MarkdownField } from '../fields/MarkdownField';
import { Dropzone, FieldGroup, ImageField, ImageListField, UploadProgress } from '../fields/media';
import fieldStyles from '../fields/fields.module.css';
import { copySlug, toFormValues, type FormProps, type ManagerConfig } from '../managers/types';
import { useRepository } from '../repository';
import { isRepoError, RepoError } from '../repository/errors';
import type { ProductFileRow, Row } from '../repository/types';
import { useConfirm, useToast } from '../ui/feedback';
import { FieldShell } from '../ui/FieldShell';
import { Icon } from '../ui/Icon';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';
import { ShopModeNotice } from './ShopModeNotice';
import { shopKeys } from './keys';
import styles from './shop.module.css';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const img = (v: unknown) => (v && typeof v === 'object' && 'path' in v ? (v as ImageRef) : null);

export const kindOptions = (Object.keys(productKindLabels) as (keyof typeof productKindLabels)[]).map(
  (value) => ({ value, label: productKindLabels[value] }),
);

/* ------------------------------------------------------------------ */
/* Price: typed in dollars / rupees, stored in cents / paise            */
/* ------------------------------------------------------------------ */

export const toMinor = (text: string): number | null => {
  const t = text.replace(/[,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
};
export const fromMinor = (v: unknown) =>
  typeof v === 'number' ? (v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2)) : '';

function PriceField({
  name,
  label,
  symbol,
  help,
  required,
}: {
  name: string;
  label: string;
  symbol: string;
  help?: string;
  required?: boolean;
}) {
  const { field } = useController({ name });
  const error = useFieldError(name);
  const [text, setText] = useState(fromMinor(field.value));
  const last = useRef(field.value);
  useEffect(() => {
    if (field.value !== last.current && !Number.isNaN(field.value)) {
      last.current = field.value;
      setText(fromMinor(field.value));
    }
  }, [field.value]);

  return (
    <FieldShell label={label} required={required} help={help} error={error}>
      {(a11y) => (
        <span className={styles.price}>
          <span className={styles.priceSymbol} aria-hidden>
            {symbol}
          </span>
          <input
            {...a11y}
            ref={field.ref}
            name={field.name}
            className={ui.input}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = toMinor(e.target.value);
              last.current = v;
              // NaN fails the schema with "Expected number"; a clearer message comes from the summary
              field.onChange(v);
            }}
            onBlur={field.onBlur}
          />
        </span>
      )}
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */
/* The file: private bucket or external link (CO-7, CO-8)              */
/* ------------------------------------------------------------------ */

const safeName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(-80) || 'file';

const extensionOf = (name: string) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m?.[1] ? m[1].toUpperCase() : '';
};

function ProductFileField({ productId }: { productId: string | null }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { setValue, getValues } = useFormContext();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [link, setLink] = useState('');
  const [replacing, setReplacing] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const file = useQuery({
    queryKey: shopKeys.file(productId ?? ''),
    queryFn: () => repo.shop.getFile(productId!),
    enabled: !!productId,
  });

  if (!productId) {
    return (
      <Notice tone="info">
        Save the product first, then add its file here. Files are stored privately and only buyers get them.
      </Notice>
    );
  }
  if (file.isPending) return <Skeleton height="4rem" />;

  const current: ProductFileRow | null = file.data ?? null;
  const fail = (e: unknown) =>
    setError(isRepoError(e) ? e.message : 'Something went wrong. Please try again.');

  const store = async (next: Omit<ProductFileRow, 'product_id'>) => {
    await repo.shop.setFile(productId, next);
    // the old stored file isn't needed any more
    if (current?.file_path && current.file_path !== next.file_path)
      await repo.files.remove([current.file_path]).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: shopKeys.file(productId) });
    setReplacing(false);
  };

  const upload = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    let path: string | null = null;
    try {
      const id = crypto.randomUUID().slice(0, 8);
      path = await repo.files.upload('products', `${productId}/${id}-${safeName(f.name)}`, f, {
        contentType: f.type || 'application/octet-stream',
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      await store({ file_path: path, external_url: null, file_name: f.name.slice(0, 200) });
      setValue('file_size', f.size, { shouldDirty: true });
      if (!str(getValues('file_format'))) setValue('file_format', extensionOf(f.name), { shouldDirty: true });
      toast.success('File stored. Save the product to update its size on the shop.');
    } catch (e) {
      if (path) await repo.files.remove([path]).catch(() => undefined);
      fail(e);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const saveLink = async () => {
    setError(null);
    const url = link.trim();
    try {
      if (!/^https:\/\/\S+$/.test(url)) throw new RepoError('invalid', 'The link must start with https://');
      const name = decodeURIComponent((url.split(/[?#]/)[0] ?? '').split('/').pop() ?? '') || 'Download';
      await store({ file_path: null, external_url: url, file_name: name.slice(0, 200) });
      setLink('');
      toast.success('Link saved. Buyers see it only on their download page.');
    } catch (e) {
      fail(e);
    }
  };

  const removeFile = async () => {
    const ok = await confirm({
      title: 'Remove the file?',
      body: <p>Buyers can&rsquo;t download this product until you add a new file.</p>,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await store({ file_path: null, external_url: null, file_name: '' });
      toast.success('File removed.');
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className={styles.fileField} data-product-file>
      {progress !== null ? (
        <UploadProgress progress={progress} onCancel={() => abort.current?.abort()} />
      ) : current && !replacing ? (
        <div className={fieldStyles.fileRow}>
          <Icon name={current.external_url ? 'external' : 'file'} />
          <span className={styles.fileText}>
            <span className={fieldStyles.fileName} data-file-name>
              {current.file_name || 'File'}
            </span>
            <span className={ui.help}>
              {current.external_url
                ? 'External link · shown only on the buyer’s download page'
                : 'Stored privately · only buyers get a 60-second link'}
            </span>
          </span>
          <Button size="small" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <Button size="small" variant="ghost" icon="trash" onClick={removeFile}>
            Remove
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.modeTabs} role="group" aria-label="Where the file is">
            <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>
              Upload (up to 50 MB)
            </button>
            <button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>
              External link
            </button>
          </div>
          {mode === 'upload' ? (
            <Dropzone
              accept=""
              onFiles={(f) => void upload(f)}
              label="Choose file"
              hint="Any type: PDF, ZIP, .cube, preset… up to 50 MB. Bigger? Use an external link."
            />
          ) : (
            <div className={styles.linkRow}>
              <label className={styles.linkLabel}>
                <span className={ui.visuallyHidden}>File link</span>
                <input
                  className={ui.input}
                  type="url"
                  inputMode="url"
                  placeholder="https://drive.google.com/…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  data-file-link
                />
              </label>
              <Button size="small" variant="primary" onClick={() => void saveLink()}>
                Save link
              </Button>
            </div>
          )}
          {replacing && (
            <Button size="small" variant="ghost" onClick={() => setReplacing(false)}>
              Keep the current file
            </Button>
          )}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProductForm({ row }: FormProps) {
  const free = useWatch({ name: 'is_free' }) as boolean;
  const size = useWatch({ name: 'file_size' }) as number | null;
  return (
    <>
      <FieldGroup title="Visibility">
        <SwitchField
          name="is_published"
          label="Published"
          help="Only published products appear in the shop."
        />
        <SwitchField
          name="is_featured"
          label="Featured"
          help="Up to 3 featured products appear in the Box Office chapter on the home page."
        />
      </FieldGroup>
      <FieldGroup title="Basics">
        <TextField name="title" label="Title" required max={100} />
        <SlugField
          name="slug"
          label="Web address"
          from="title"
          auto={!row}
          publishedValue={row?.is_published ? str(row.slug) : null}
          prefix="/shop/"
        />
        <SelectField name="kind" label="Type" options={kindOptions} />
        <TextField
          name="tagline"
          label="Short line"
          max={160}
          help="One line on the poster, e.g. “12 looks for aerial footage”."
        />
      </FieldGroup>
      <FieldGroup
        title="Price"
        description="Buyers pay on the payment provider's checkout. Saving updates the product there for you."
      >
        <SwitchField
          name="is_free"
          label="Free"
          help="Visitors get the download link by email, without checkout."
        />
        {!free && (
          <div className={fieldStyles.twoCol}>
            <PriceField name="price_usd" label="Price (USD)" symbol="$" required help="e.g. 19 or 9.99" />
            <PriceField
              name="price_inr"
              label="Price in India (INR)"
              symbol="₹"
              help="Optional. Offered to buyers in India instead of USD."
            />
          </div>
        )}
      </FieldGroup>
      <FieldGroup title="The file" description="What buyers download.">
        <ProductFileField productId={row ? String(row.id) : null} />
        <div className={fieldStyles.twoCol}>
          <TextField name="file_format" label="Format shown" max={40} placeholder="e.g. ZIP, PDF, CUBE" />
          <TextField name="version" label="Version" max={30} placeholder="e.g. 1.2" />
        </div>
        {size != null && size > 0 && <p className={ui.help}>Size shown on the shop: {formatSize(size)}</p>}
      </FieldGroup>
      <FieldGroup title="Details">
        <MarkdownField name="description" label="Description" max={20000} rows={10} />
        <ListField name="included" label="What's included" max={120} maxItems={20} />
        <TextField
          name="requirements"
          label="Works with"
          max={200}
          placeholder="e.g. DaVinci Resolve 18+, Premiere Pro"
        />
      </FieldGroup>
      <FieldGroup title="Images">
        <ImageField name="cover" label="Cover (poster)" help="A tall 2:3 image works best." />
        <ImageListField name="gallery" label="Gallery" help="Up to 8 previews." />
      </FieldGroup>
    </>
  );
}

const priceText = (r: Row) =>
  r.is_free
    ? 'Free'
    : [
        typeof r.price_usd === 'number' ? formatPrice(r.price_usd, 'USD') : '',
        typeof r.price_inr === 'number' ? formatPrice(r.price_inr, 'INR') : '',
      ]
        .filter(Boolean)
        .join(' / ');

/**
 * Every save of a paid product updates the provider (AD-8.2). Always syncing (rather than only
 * on changes) also moves products over to live mode: save each one once after switching.
 */
export const needsSync = (row: Row) => !row.is_free && row.price_usd != null;

export const productsConfig: ManagerConfig = {
  table: 'products',
  path: 'products',
  singular: 'product',
  plural: 'Products',
  description: 'PDFs and editing tools you sell in the Box Office.',
  emptyText: 'Add a guide, a LUT pack or a preset — a cover, a price and the file are enough.',
  mediaFolder: 'shop',
  schema: productInsert,
  newValues: () => ({
    title: '',
    slug: '',
    kind: 'pdf',
    tagline: '',
    description: '',
    included: [],
    requirements: '',
    version: '',
    file_format: '',
    file_size: null,
    is_free: false,
    price_usd: null,
    price_inr: null,
    cover: null,
    gallery: [],
    is_featured: false,
    is_published: false,
  }),
  title: (r) => str(r.title) || 'Untitled product',
  subtitle: (r) =>
    [productKindLabels[r.kind as keyof typeof productKindLabels], priceText(r), r.is_featured && 'Featured']
      .filter(Boolean)
      .join(' · '),
  image: (r) => img(r.cover),
  duplicate: (r, all) => ({
    ...toFormValues(r),
    provider_product_id: undefined,
    provider_product_id_inr: undefined,
    title: `${str(r.title)} (copy)`.slice(0, 100),
    slug: copySlug(
      str(r.slug),
      all.map((x) => str(x.slug)),
    ),
  }),
  async afterSave({ row, repo }) {
    if (!needsSync(row)) return;
    try {
      return await repo.shop.sync(String(row.id));
    } catch (e) {
      const why = isRepoError(e) ? e.message : 'the payment provider could not be reached.';
      throw new RepoError(
        'unknown',
        `couldn't update the payment provider (${why}) Buyers can't check out until this works; save again to retry.`,
      );
    }
  },
  ListNotice: ShopModeNotice,
  Form: ProductForm,
};
