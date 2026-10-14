/** Custom-section builder (spec 02 AD-50 – AD-57). */
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { customSectionInsert, fieldDefinition, fieldTypes, type FieldDefinition } from '../../data/schemas';
import { SelectField, SlugField, SwitchField, TextField, useFieldError } from '../fields/basic';
import { useAdminList } from '../data/hooks';
import fieldStyles from '../fields/fields.module.css';
import { FieldGroup } from '../fields/media';
import { SortableList } from '../managers/SortableList';
import { chapterOptions, labelOf, layoutOptions } from '../managers/options';
import { copySlug, toFormValues, type FormProps, type ManagerConfig } from '../managers/types';
import { FieldShell } from '../ui/FieldShell';
import { Button, IconButton, Notice, Switch, ui } from '../ui/primitives';
import type { ReactNode } from 'react';
import { ItemFields } from './ItemFields';
import { fieldChanges, fieldTypeLabels, keyFromLabel, sectionTemplates, uniqueKey } from './templates';
import styles from './sections.module.css';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/* ------------------------------------------------------------------ */
/* Template picker (new sections)                                      */
/* ------------------------------------------------------------------ */

function TemplatePicker({ onPick }: { onPick: () => void }) {
  const { reset, getValues } = useFormContext();
  return (
    <FieldGroup title="Start from a template" description="Every field can be changed afterwards.">
      <ul className={styles.templates}>
        {sectionTemplates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={styles.template}
              onClick={() => {
                reset({
                  ...getValues(),
                  name: t.name,
                  slug: t.slug,
                  intro: t.intro,
                  layout: t.layout,
                  fields: t.fields.map((f) => ({ ...f, options: f.options ?? null, help: f.help ?? null })),
                });
                onPick();
              }}
            >
              <span className={styles.templateName}>{t.name || 'Blank'}</span>
              <span className={ui.help}>{t.description}</span>
              <span className={styles.templateFields}>{t.fields.map((f) => f.label).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </FieldGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Field editor                                                        */
/* ------------------------------------------------------------------ */

function FieldRow({
  index,
  handle,
  keyLocked,
  autoKey,
  setAutoKey,
  onRemove,
  canRemove,
}: {
  index: number;
  handle: ReactNode;
  keyLocked: boolean;
  autoKey: boolean;
  setAutoKey: (v: boolean) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { setValue, getValues } = useFormContext();
  const base = `fields.${index}`;
  const label = useWatch({ name: `${base}.label` }) as string;
  const type = useWatch({ name: `${base}.type` }) as FieldDefinition['type'];
  const options = useWatch({ name: `${base}.options` }) as string[] | null;
  const required = useWatch({ name: `${base}.required` }) as boolean;
  const optionsError = useFieldError(`${base}.options`);
  const [optionsText, setOptionsText] = useState((options ?? []).join('\n'));

  // keep the key in step with the label until it is edited by hand or locked
  useEffect(() => {
    if (!autoKey || keyLocked) return;
    const others = (getValues('fields') as FieldDefinition[]).filter((_, i) => i !== index).map((f) => f.key);
    setValue(`${base}.key`, uniqueKey(keyFromLabel(label ?? ''), others), { shouldDirty: true });
  }, [label, autoKey, keyLocked, base, index, getValues, setValue]);

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHead}>
        {handle}
        <span className={styles.fieldTitle}>{label || `Field ${index + 1}`}</span>
        <span className={ui.help}>{fieldTypeLabels[type] ?? type}</span>
        <IconButton
          icon="trash"
          label={`Remove field ${label || index + 1}`}
          onClick={onRemove}
          disabled={!canRemove}
        />
      </div>
      <div className={fieldStyles.twoCol}>
        <TextField name={`${base}.label`} label="Label" required max={40} />
        <SelectField
          name={`${base}.type`}
          label="Type"
          required
          options={fieldTypes.map((t) => ({ value: t, label: fieldTypeLabels[t] }))}
        />
      </div>
      {type === 'select' && (
        <FieldShell label="Options" required help="One per line." error={optionsError}>
          {(a11y) => (
            <textarea
              {...a11y}
              className={ui.textarea}
              rows={4}
              value={optionsText}
              onChange={(e) => {
                setOptionsText(e.target.value);
                const list = [
                  ...new Set(
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ];
                setValue(`${base}.options`, list, { shouldDirty: true, shouldValidate: true });
              }}
            />
          )}
        </FieldShell>
      )}
      <div className={fieldStyles.twoCol}>
        <TextField name={`${base}.help`} label="Help text" max={120} nullable />
        <TextField
          name={`${base}.key`}
          label="Key"
          required
          max={30}
          readOnly={keyLocked}
          help={
            keyLocked
              ? 'Locked because items already use it.'
              : 'Used to store the value. Generated from the label.'
          }
        />
      </div>
      <div className={styles.fieldFooter}>
        <Switch
          checked={!!required}
          onChange={(v) => setValue(`${base}.required`, v, { shouldDirty: true })}
          label="Required"
        />
        {!keyLocked && !autoKey && (
          <button type="button" className={fieldStyles.inlineLink} onClick={() => setAutoKey(true)}>
            Generate key from label
          </button>
        )}
      </div>
    </div>
  );
}

function FieldEditor({ lockedKeys }: { lockedKeys: Set<string> }) {
  const { control, setValue, getValues } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'fields' });
  const arrayError = useFieldError('fields');
  // Fields added in this session follow their label; fields that were already there keep their key.
  const [initialIds] = useState(() => new Set(fields.map((f) => f.id)));
  const [auto, setAuto] = useState<Record<string, boolean>>({});

  const values = useWatch({ name: 'fields' }) as FieldDefinition[];

  // When the type changes to/from select, keep `options` valid.
  useEffect(() => {
    values?.forEach((f, i) => {
      if (f.type === 'select' && !Array.isArray(f.options)) setValue(`fields.${i}.options`, []);
      if (f.type !== 'select' && f.options != null) setValue(`fields.${i}.options`, null);
    });
  }, [values, setValue]);

  const items = fields.map((f, i) => ({ id: f.id, index: i }));

  return (
    <FieldGroup title="Fields" description="What each item in this section has. 1 to 15 fields.">
      {arrayError && <Notice tone="error">{arrayError}</Notice>}
      <SortableList
        items={items}
        label={(it) => str(values?.[it.index]?.label) || `Field ${it.index + 1}`}
        onReorder={(_ids, m) => move(m.from, m.to)}
        renderItem={(it, handle) => {
          const key = str(values?.[it.index]?.key);
          return (
            <FieldRow
              index={it.index}
              handle={handle}
              keyLocked={lockedKeys.has(key)}
              autoKey={auto[it.id] ?? !initialIds.has(it.id)}
              setAutoKey={(v) => setAuto((a) => ({ ...a, [it.id]: v }))}
              onRemove={() => remove(it.index)}
              canRemove={fields.length > 1}
            />
          );
        }}
      />
      {fields.length < 15 && (
        <Button
          icon="plus"
          onClick={() => {
            const taken = (getValues('fields') as FieldDefinition[]).map((f) => f.key);
            append({
              key: uniqueKey('field', taken),
              label: '',
              type: 'text',
              required: false,
              options: null,
              help: null,
            });
          }}
        >
          Add field
        </Button>
      )}
    </FieldGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Live preview (AD-52)                                                */
/* ------------------------------------------------------------------ */

function Preview() {
  const fields = useWatch({ name: 'fields' }) as unknown[];
  const name = useWatch({ name: 'name' }) as string;
  const valid = useMemo(
    () =>
      (fields ?? []).flatMap((f) => {
        const r = fieldDefinition.safeParse(f);
        return r.success ? [r.data] : [];
      }),
    [fields],
  );
  const signature = JSON.stringify(valid);
  const preview = useForm({ defaultValues: { data: {} } });

  useEffect(() => {
    preview.reset({ data: {} });
    // reset when the definitions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <aside className={styles.preview} aria-label="Item form preview">
      <p className="label">Preview · new {str(name).replace(/s$/, '').toLowerCase() || 'item'}</p>
      <FormProvider {...preview}>
        <div className={styles.previewBody} key={signature}>
          {valid.length ? (
            <ItemFields fields={valid} />
          ) : (
            <p className={ui.help}>Add a field to see the form.</p>
          )}
        </div>
      </FormProvider>
      {valid.length < (fields?.length ?? 0) && (
        <p className={ui.help}>Fields with errors are left out of the preview.</p>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* The builder form                                                    */
/* ------------------------------------------------------------------ */

function SectionForm({ row }: FormProps) {
  const [picked, setPicked] = useState(!!row);
  const items = useAdminList('custom_items', { column: 'section_id', value: row?.id ?? 'none' });
  // Keys already saved are locked once the section has items (renaming would hide their data).
  const lockedKeys = useMemo(() => {
    const saved = (row?.fields as FieldDefinition[] | undefined) ?? [];
    return new Set((items.data?.length ?? 0) > 0 ? saved.map((f) => f.key) : []);
  }, [row, items.data]);
  const hasPage = useWatch({ name: 'has_page' }) as boolean;
  const slug = useWatch({ name: 'slug' }) as string;

  if (!picked) return <TemplatePicker onPick={() => setPicked(true)} />;

  return (
    <div className={styles.builder}>
      <div className={styles.builderMain}>
        <FieldGroup title="Visibility">
          <SwitchField
            name="is_published"
            label="Published"
            help="Only published sections and items appear on the site."
          />
        </FieldGroup>
        <FieldGroup title="Section">
          <TextField name="name" label="Name" required max={60} help="e.g. Talks, Certifications, Gear." />
          <SlugField
            name="slug"
            label="Web address"
            from="name"
            auto={!row}
            publishedValue={row?.is_published && row?.has_page ? str(row.slug) : null}
            prefix="/s/"
          />
          <TextField name="intro" label="Intro" max={500} multiline rows={3} />
          <div className={fieldStyles.twoCol}>
            <SelectField name="layout" label="Layout" options={layoutOptions} />
            <SelectField
              name="insert_after"
              label="Show after"
              options={chapterOptions}
              help="Where it sits on the home page."
            />
          </div>
          <SwitchField name="show_on_home" label="Show on the home page" />
          <SwitchField
            name="has_page"
            label="Give it its own page"
            help={hasPage ? `At /s/${slug || '…'}` : undefined}
          />
          <SwitchField name="show_in_nav" label="Show in the site navigation" />
        </FieldGroup>
        <FieldEditor lockedKeys={lockedKeys} />
      </div>
      <Preview />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manager config                                                      */
/* ------------------------------------------------------------------ */

export const sectionsConfig: ManagerConfig = {
  table: 'custom_sections',
  path: 'sections',
  singular: 'section',
  plural: 'Your sections',
  description:
    'Sections you design yourself — Talks, Certifications, Gear… Each gets its own fields and items.',
  emptyText: 'Create a section from a template, or start blank.',
  mediaFolder: 'sections',
  schema: customSectionInsert,
  newValues: () => ({
    name: '',
    slug: '',
    intro: '',
    layout: 'grid',
    fields: [{ key: 'title', label: 'Title', type: 'text', required: true, options: null, help: null }],
    insert_after: 'reviews',
    show_on_home: true,
    has_page: false,
    show_in_nav: false,
    is_published: false,
  }),
  title: (r) => str(r.name) || 'Untitled section',
  subtitle: (r) =>
    `${(r.fields as unknown[] | undefined)?.length ?? 0} fields · ${labelOf(layoutOptions, r.layout)} · after ${labelOf(chapterOptions, r.insert_after)}`,
  duplicate: (r, all) => ({
    ...toFormValues(r),
    name: `${str(r.name)} (copy)`.slice(0, 60),
    slug: copySlug(
      str(r.slug),
      all.map((x) => str(x.slug)),
    ),
  }),
  Form: SectionForm,
  rowLinks: (r) => [{ label: 'Items', to: `/admin/sections/${r.id}/items` }],
  async beforeSave({ values, saved, repo, confirm }) {
    const items = await repo.data.list('custom_items', { where: { column: 'section_id', value: saved.id } });
    const changes = fieldChanges(
      (saved.fields as FieldDefinition[]) ?? [],
      (values.fields as FieldDefinition[]) ?? [],
      items.map((i) => ({ data: (i.data ?? {}) as Record<string, unknown> })),
    );
    if (changes.length === 0) return true;
    return confirm({
      title: 'Save these field changes?',
      body: (
        <>
          <ul style={{ paddingLeft: 'var(--space-5)', display: 'grid', gap: 'var(--space-1)' }}>
            {changes.map((c) => (
              <li key={c.key}>
                {c.itemsWithValues} item{c.itemsWithValues === 1 ? '' : 's'}{' '}
                {c.itemsWithValues === 1 ? 'has' : 'have'} values for <strong>{c.label}</strong>
                {c.kind === 'removed'
                  ? ', which will be hidden.'
                  : ' in its old type; they may need editing before those items can be saved again.'}
              </li>
            ))}
          </ul>
          <p>
            Nothing is deleted: hidden values stay with each item and can be restored by adding the field
            back.
          </p>
        </>
      ),
      confirmLabel: 'Save changes',
    });
  },
  async deleteDetails(row, repo) {
    const items = await repo.data.list('custom_items', { where: { column: 'section_id', value: row.id } });
    return items.length ? (
      <p>
        <strong>
          {items.length} item{items.length === 1 ? '' : 's'}
        </strong>{' '}
        in this section will be deleted too.
      </p>
    ) : null;
  },
};

export function SectionItemsLink({ id }: { id: string }) {
  return (
    <Link to={`/admin/sections/${id}/items`} className={fieldStyles.inlineLink}>
      Manage items
    </Link>
  );
}
