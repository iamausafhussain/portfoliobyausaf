/** Items of one custom section, with forms generated from its fields (spec 02 AD-55). */
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router';
import {
  buildItemSchema,
  customItemInsert,
  customSectionRow,
  type CustomSection,
  type FieldDefinition,
  type ImageRef,
} from '../../data/schemas';
import { useAdminRow } from '../data/hooks';
import { FieldGroup } from '../fields/media';
import { FormPage } from '../managers/FormPage';
import { ListPage } from '../managers/ListPage';
import { toFormValues, type FormProps, type ManagerConfig } from '../managers/types';
import { PageBody } from '../shell/PageHeader';
import { SwitchField } from '../fields/basic';
import { Button, ButtonLink, Notice, Skeleton } from '../ui/primitives';
import { ItemFields } from './ItemFields';
import { emptyItemData, hiddenData } from './templates';
import styles from './sections.module.css';

function HiddenData({ fields }: { fields: readonly FieldDefinition[] }) {
  const { setValue } = useFormContext();
  const data = (useWatch({ name: 'data' }) ?? {}) as Record<string, unknown>;
  const hidden = hiddenData(fields, data);
  const keys = Object.keys(hidden);
  if (!keys.length) return null;
  return (
    <FieldGroup
      title="Hidden data"
      description="Values for fields this section no longer has. They aren't shown on the site."
    >
      <dl className={styles.hidden}>
        {keys.map((k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{typeof hidden[k] === 'string' ? String(hidden[k]) : JSON.stringify(hidden[k])}</dd>
          </div>
        ))}
      </dl>
      <div>
        <Button
          size="small"
          variant="danger"
          icon="trash"
          onClick={() => {
            const next = Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));
            setValue('data', next, { shouldDirty: true });
          }}
        >
          Remove hidden data
        </Button>
      </div>
    </FieldGroup>
  );
}

const firstOfType = (
  fields: readonly FieldDefinition[],
  data: Record<string, unknown>,
  type: FieldDefinition['type'],
) => {
  const f = fields.find((x) => x.type === type);
  return f ? data[f.key] : undefined;
};

export function itemsConfig(section: CustomSection): ManagerConfig {
  const fields = section.fields;
  const dataOf = (r: Record<string, unknown>) => (r.data ?? {}) as Record<string, unknown>;

  function ItemForm(_props: FormProps) {
    return (
      <>
        <FieldGroup title="Visibility">
          <SwitchField
            name="is_published"
            label="Published"
            help={
              section.is_published
                ? undefined
                : 'The section itself is a draft, so nothing in it is on the site yet.'
            }
          />
        </FieldGroup>
        <FieldGroup title={section.name}>
          <ItemFields fields={fields} />
        </FieldGroup>
        <HiddenData fields={fields} />
      </>
    );
  }

  const title = (r: Record<string, unknown>) => {
    const v = firstOfType(fields, dataOf(r), 'text');
    return typeof v === 'string' && v.trim() ? v : 'Untitled item';
  };

  return {
    table: 'custom_items',
    path: `sections/${section.id}/items`,
    singular: 'item',
    plural: section.name,
    description: section.intro || `Items in ${section.name}.`,
    emptyText: `Add the first item to ${section.name}.`,
    mediaFolder: `sections-${section.slug}`,
    schema: customItemInsert.extend({ data: buildItemSchema(fields) }),
    newValues: () => ({ data: emptyItemData(fields), is_published: false }),
    fixed: { section_id: section.id },
    title,
    subtitle: (r) => {
      const d = dataOf(r);
      const date = firstOfType(fields, d, 'date');
      const select = firstOfType(fields, d, 'select');
      return [select, date].filter((x) => typeof x === 'string' && x).join(' · ');
    },
    image: fields.some((f) => f.type === 'image')
      ? (r) => {
          const v = firstOfType(fields, dataOf(r), 'image');
          return v && typeof v === 'object' && 'path' in v ? (v as ImageRef) : null;
        }
      : undefined,
    duplicate: (r) => ({ ...toFormValues(r) }),
    Form: ItemForm,
  };
}

function useSection(id: string | undefined) {
  const q = useAdminRow('custom_sections', id);
  const section = useMemo(() => {
    const r = customSectionRow.safeParse(q.data);
    return r.success ? r.data : null;
  }, [q.data]);
  return { ...q, section };
}

export function SectionItemsPage() {
  const { id } = useParams();
  const { section, isPending } = useSection(id);
  const config = useMemo(() => (section ? itemsConfig(section) : null), [section]);
  if (isPending)
    return (
      <PageBody>
        <Skeleton height="16rem" />
      </PageBody>
    );
  if (!section || !config)
    return (
      <PageBody>
        <Notice tone="error">This section doesn&rsquo;t exist any more.</Notice>
      </PageBody>
    );
  return (
    <ListPage
      config={config}
      where={{ column: 'section_id', value: section.id }}
      header={{
        title: section.name,
        description: (
          <>
            {section.intro || 'Items in this section.'}{' '}
            {!section.is_published && <strong>This section is a draft.</strong>}
          </>
        ),
        back: { to: '/admin/sections', label: 'Your sections' },
      }}
      extraActions={
        <ButtonLink to={`/admin/sections/${section.id}`} icon="grid">
          Edit fields
        </ButtonLink>
      }
    />
  );
}

export function SectionItemFormPage() {
  const { id, itemId } = useParams();
  const { section, isPending } = useSection(id);
  const config = useMemo(() => (section ? itemsConfig(section) : null), [section]);
  if (isPending)
    return (
      <PageBody>
        <Skeleton height="16rem" />
      </PageBody>
    );
  if (!section || !config)
    return (
      <PageBody>
        <Notice tone="error">This section doesn&rsquo;t exist any more.</Notice>
      </PageBody>
    );
  return (
    <FormPage
      config={config}
      id={itemId}
      basePath={`/admin/sections/${section.id}/items`}
      header={{
        back: { to: `/admin/sections/${section.id}/items`, label: section.name },
        eyebrow: section.name,
      }}
    />
  );
}
