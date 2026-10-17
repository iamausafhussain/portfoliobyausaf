/**
 * Discount codes (spec 08 DC-1 – DC-5): created here, kept on the payment provider, typed by
 * buyers on the checkout page or applied for them by a code link (/shop/<slug>?code=CODE).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAdminList } from '../data/hooks';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { DiscountRow, Row } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useConfirm, useToast } from '../ui/feedback';
import { FieldShell } from '../ui/FieldShell';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';
import { shopKeys } from './keys';
import { ShopModeNotice } from './ShopModeNotice';
import styles from './shop.module.css';

const longDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));

/** Paid products that exist on the provider, i.e. that a code can apply to. */
const sellable = (products: Row[]) =>
  products.filter((p) => !p.is_free && (p.provider_product_id || p.provider_product_id_inr));

const providerIds = (p: Row) =>
  [p.provider_product_id, p.provider_product_id_inr].filter((x): x is string => typeof x === 'string');

export type DiscountState = 'active' | 'expired' | 'used_up';
export function discountState(d: DiscountRow, now = Date.now()): DiscountState {
  if (d.expiresAt && Date.parse(d.expiresAt) <= now) return 'expired';
  if (d.usageLimit != null && d.timesUsed >= d.usageLimit) return 'used_up';
  return 'active';
}
const stateLabels: Record<DiscountState, string> = {
  active: 'Active',
  expired: 'Expired',
  used_up: 'Used up',
};

/** Products a code works for (all paid products when it isn't restricted). */
export function productsFor(d: DiscountRow, products: Row[]): Row[] {
  const list = sellable(products);
  if (!d.restrictedTo.length) return list;
  return list.filter((p) => providerIds(p).some((id) => d.restrictedTo.includes(id)));
}

/** A link that opens the product with the code applied (DC-4). */
export const codeLink = (origin: string, slug: string, code: string) =>
  `${origin}/shop/${slug}?code=${encodeURIComponent(code)}`;

/** The end of the chosen day, in the admin's time zone, as an ISO time. */
export const endOfDay = (date: string) => new Date(`${date}T23:59:59`).toISOString();

function NewCodeForm({ products, onDone }: { products: Row[]; onDone: () => void }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [limit, setLimit] = useState('');
  const [expires, setExpires] = useState('');
  const [onlySome, setOnlySome] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const list = sellable(products);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const c = code.trim();
    if (c && !/^[A-Za-z0-9_-]{3,32}$/.test(c))
      errs.code = 'Use 3–32 letters, numbers, “-” or “_”, with no spaces.';
    const pct = Number(percent);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) errs.percent = 'Enter a whole number from 1 to 100.';
    const lim = limit.trim() ? Number(limit) : null;
    if (lim !== null && (!Number.isInteger(lim) || lim < 1))
      errs.usage_limit = 'Enter 1 or more, or leave it empty.';
    if (expires && expires < today) errs.expires_at = 'Pick today or a later date.';
    if (onlySome && !chosen.length) errs.restricted_to = 'Pick at least one product.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const created = await repo.shop.createDiscount({
        code: c,
        percent: pct,
        usage_limit: lim,
        expires_at: expires ? endOfDay(expires) : null,
        restricted_to: onlySome ? list.filter((p) => chosen.includes(String(p.id))).flatMap(providerIds) : [],
      });
      toast.success(`Code ${created.code} created.`);
      await qc.invalidateQueries({ queryKey: shopKeys.discounts });
      onDone();
    } catch (err) {
      if (isRepoError(err) && err.field) setErrors({ [err.field]: err.message });
      else toast.error(isRepoError(err) ? err.message : 'Couldn’t create the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.discountForm} onSubmit={submit} noValidate data-new-discount>
      <h2 className={styles.formTitle}>New discount code</h2>
      <div className={styles.formGrid}>
        <FieldShell
          label="Code"
          help="Leave empty for a random code. Buyers type it in any case."
          error={errors.code}
        >
          {(a11y) => (
            <input
              {...a11y}
              className={ui.input}
              value={code}
              placeholder="e.g. DIWALI20"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          )}
        </FieldShell>
        <FieldShell label="Percent off" required help="A whole number, 1 to 100." error={errors.percent}>
          {(a11y) => (
            <span className={styles.percent}>
              <input
                {...a11y}
                className={ui.input}
                inputMode="numeric"
                value={percent}
                placeholder="20"
                onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className={styles.percentSign} aria-hidden>
                %
              </span>
            </span>
          )}
        </FieldShell>
        <FieldShell
          label="Uses allowed"
          help="In total, across all buyers. Empty = no limit."
          error={errors.usage_limit}
        >
          {(a11y) => (
            <input
              {...a11y}
              className={ui.input}
              inputMode="numeric"
              value={limit}
              placeholder="No limit"
              onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))}
            />
          )}
        </FieldShell>
        <FieldShell
          label="Last day"
          help="Works until the end of this day. Empty = never expires."
          error={errors.expires_at}
        >
          {(a11y) => (
            <input
              {...a11y}
              className={ui.input}
              type="date"
              min={today}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          )}
        </FieldShell>
      </div>
      <fieldset className={styles.productPick}>
        <legend className={ui.label}>Works for</legend>
        <label className={styles.radio}>
          <input type="radio" name="scope" checked={!onlySome} onChange={() => setOnlySome(false)} />
          All products
        </label>
        <label className={styles.radio}>
          <input type="radio" name="scope" checked={onlySome} onChange={() => setOnlySome(true)} />
          Only some products
        </label>
        {onlySome && (
          <div className={styles.checkList}>
            {list.length === 0 && (
              <p className={ui.help}>No paid products yet. Save a product with a price first.</p>
            )}
            {list.map((p) => (
              <label key={String(p.id)} className={styles.radio}>
                <input
                  type="checkbox"
                  checked={chosen.includes(String(p.id))}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...c, String(p.id)] : c.filter((x) => x !== String(p.id)),
                    )
                  }
                />
                {String(p.title)}
              </label>
            ))}
          </div>
        )}
        {errors.restricted_to && (
          <p className={styles.fieldError} role="alert">
            {errors.restricted_to}
          </p>
        )}
      </fieldset>
      <div className={styles.formActions}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Create code
        </Button>
      </div>
    </form>
  );
}

function DiscountItem({ d, products }: { d: DiscountRow; products: Row[] }) {
  const repo = useRepository();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const eligible = productsFor(d, products);
  const [slug, setSlug] = useState(String(eligible[0]?.slug ?? ''));
  const state = discountState(d);
  const restricted = d.restrictedTo.length > 0;

  async function copy() {
    const link = codeLink(window.location.origin, slug, d.code);
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied.');
    } catch {
      toast.show('success', link);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete code ${d.code}?`,
      body: <p>Buyers can&rsquo;t use it any more, and links with this code stop giving the discount.</p>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.shop.deleteDiscount(d.id);
      toast.success(`Deleted ${d.code}.`);
      await qc.invalidateQueries({ queryKey: shopKeys.discounts });
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Couldn’t delete the code.');
    }
  }

  return (
    <li className={styles.discount} data-discount={d.code} data-state={state}>
      <div className={styles.discountMain}>
        <span className={styles.discountCode}>{d.code}</span>
        <span className={styles.discountOff}>
          {d.kind === 'flat' ? 'Fixed amount off' : `${d.percent}% off`}
        </span>
        <span className={styles.orderStatus} data-tone={state === 'active' ? 'paid' : 'revoked'}>
          {stateLabels[state]}
        </span>
      </div>
      <p className={styles.orderMeta}>
        <span data-used>
          Used {d.timesUsed}
          {d.usageLimit != null ? ` of ${d.usageLimit}` : ' times'}
        </span>
        <span>{d.expiresAt ? `Until ${longDate(d.expiresAt)}` : 'No expiry'}</span>
        <span>
          {restricted
            ? eligible.length
              ? eligible.map((p) => String(p.title)).join(', ')
              : 'Products that no longer exist'
            : 'All products'}
        </span>
      </p>
      <div className={styles.orderActions}>
        {state === 'active' && eligible.length > 0 && (
          <>
            <label className={styles.linkFor}>
              <span className={ui.visuallyHidden}>Link for product</span>
              <select className={ui.select} value={slug} onChange={(e) => setSlug(e.target.value)}>
                {eligible.map((p) => (
                  <option key={String(p.id)} value={String(p.slug)}>
                    {String(p.title)}
                  </option>
                ))}
              </select>
            </label>
            <Button size="small" icon="copy" onClick={() => void copy()} data-copy-link>
              Copy link
            </Button>
          </>
        )}
        <Button size="small" variant="ghost" icon="trash" onClick={() => void remove()}>
          Delete
        </Button>
      </div>
    </li>
  );
}

export function DiscountsPage() {
  const repo = useRepository();
  const products = useAdminList('products');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: shopKeys.discounts, queryFn: () => repo.shop.discounts(), staleTime: 0 });
  const rows = q.data ?? [];
  const all = products.data ?? [];

  return (
    <>
      <PageHeader
        title="Discount codes"
        description="Buyers type a code on the checkout page, or you share a link that applies it for them. Codes take a percentage off and are kept on the payment provider."
        actions={
          !adding && (
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              New code
            </Button>
          )
        }
      />
      <PageBody>
        <ShopModeNotice />
        {adding && <NewCodeForm products={all} onDone={() => setAdding(false)} />}
        {q.isError ? (
          <Notice
            tone="error"
            action={
              <Button size="small" onClick={() => q.refetch()}>
                Retry
              </Button>
            }
          >
            {isRepoError(q.error) ? q.error.message : 'Couldn’t load the codes.'}
          </Notice>
        ) : q.isPending ? (
          <Skeleton height="6rem" />
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            <p>No discount codes yet. Create one for a launch, a festival sale or your subscribers.</p>
          </div>
        ) : (
          <ul className={styles.orders}>
            {rows.map((d) => (
              <DiscountItem key={d.id} d={d} products={all} />
            ))}
          </ul>
        )}
        <p className={ui.help}>
          Flat-amount codes (for example ₹200 off) can be made in the payment provider&rsquo;s dashboard; they
          show up here too.
        </p>
      </PageBody>
    </>
  );
}
