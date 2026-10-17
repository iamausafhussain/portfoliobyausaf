import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';
import type { ImageRef } from '../../data/schemas';
import type { AdminRepository, AdminTable, Row, Values } from '../repository/types';
import type { ConfirmOptions } from '../ui/feedback';

export interface FormProps {
  /** The saved row, or null for a new item. */
  row: Row | null;
}

export interface ManagerConfig {
  table: AdminTable;
  /** Path under /admin, e.g. "projects" or "sections/<id>/items" */
  path: string;
  singular: string;
  plural: string;
  description: string;
  emptyText: string;
  /** Folder for uploads, e.g. "projects" */
  mediaFolder: string;
  /** Zod schema for the whole form (Part 1 insert schema or a derived one). */
  schema: z.ZodType;
  newValues(): Values;
  title(row: Row): string;
  subtitle?(row: Row): string;
  image?(row: Row): ImageRef | null;
  /** Optional grouping in the list (skills by category). */
  groupBy?(row: Row): string;
  /** Values for "Duplicate" (AD-15). */
  duplicate?(row: Row, all: Row[]): Values;
  Form: ComponentType<FormProps>;
  /** Fields fixed for every row of this list (e.g. section_id for custom items). */
  fixed?: Values;
  /** Runs before saving an existing row; return false to cancel (section field changes, AD-54). */
  beforeSave?(args: {
    values: Values;
    saved: Row;
    repo: AdminRepository;
    confirm: (o: ConfirmOptions) => Promise<boolean>;
  }): Promise<boolean>;
  /**
   * Runs after every successful save, e.g. to update the payment provider (spec 08 AD-8.2).
   * May return a newer row. If it throws, the save still stands and its message is shown.
   */
  afterSave?(args: { row: Row; previous: Row | null; repo: AdminRepository }): Promise<Row | void>;
  /** Shown above the list (e.g. the shop's payment mode). */
  ListNotice?: ComponentType;
  /** Extra links shown on each list row (e.g. "Items" for sections). */
  rowLinks?(row: Row): { label: string; to: string }[];
  /** Extra text for the delete confirmation (e.g. "4 items will be deleted", AD-56). */
  deleteDetails?(row: Row, repo: AdminRepository): Promise<ReactNode>;
}

export const serverFields = ['id', 'created_at', 'updated_at'] as const;

export function toFormValues(row: Row): Values {
  const v: Values = { ...row };
  for (const k of serverFields) delete v[k];
  return v;
}

/** Next free slug: "name-copy", "name-copy-2", … */
export function copySlug(slug: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `${slug.replace(/-copy(-\d+)?$/, '').slice(0, 70)}-copy`;
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}
