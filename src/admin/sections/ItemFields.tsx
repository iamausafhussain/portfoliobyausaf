/** Renders the form for a custom-section item from its field definitions (spec 02 AD-55). */
import type { FieldDefinition } from '../../data/schemas';
import { DateField, NumberField, SelectField, SwitchField, TextField, UrlField } from '../fields/basic';
import { MarkdownField } from '../fields/MarkdownField';
import { ImageField } from '../fields/media';
import { TagsField } from '../fields/TagsField';

export function ItemField({ field, prefix = 'data' }: { field: FieldDefinition; prefix?: string }) {
  const name = `${prefix}.${field.key}`;
  const common = { name, label: field.label, required: field.required, help: field.help ?? undefined };
  switch (field.type) {
    case 'text':
      return <TextField {...common} max={200} />;
    case 'long_text':
      return <TextField {...common} max={2000} multiline rows={4} />;
    case 'markdown':
      return <MarkdownField {...common} max={10000} rows={8} />;
    case 'number':
      return <NumberField {...common} />;
    case 'date':
      return <DateField {...common} />;
    case 'url':
      return <UrlField {...common} />;
    case 'image':
      return <ImageField {...common} />;
    case 'tags':
      return <TagsField {...common} />;
    case 'boolean':
      return <SwitchField name={name} label={field.label} help={field.help ?? undefined} />;
    case 'select':
      return (
        <SelectField
          {...common}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          emptyLabel={field.required ? undefined : '—'}
        />
      );
  }
}

export function ItemFields({ fields, prefix }: { fields: readonly FieldDefinition[]; prefix?: string }) {
  return (
    <>
      {fields.map((f) => (
        <ItemField key={f.key} field={f} prefix={prefix} />
      ))}
    </>
  );
}
