/**
 * Every row from the database passes through its Zod schema before the UI sees it
 * (master spec §13, AC-1.22). Invalid rows are logged and dropped, never rendered.
 */
import type { z } from 'zod';

export type InvalidRowReporter = (table: string, row: unknown, error: z.ZodError) => void;

const defaultReporter: InvalidRowReporter = (table, row, error) => {
  const id = typeof row === 'object' && row !== null && 'id' in row ? String(row.id) : 'unknown id';
  console.warn(`[data] Skipped invalid row in "${table}" (${id}):`, error.issues);
};

let report = defaultReporter;

/** For tests. */
export function setInvalidRowReporter(fn: InvalidRowReporter | null) {
  report = fn ?? defaultReporter;
}

export function parseRows<S extends z.ZodType>(
  schema: S,
  rows: readonly unknown[],
  table: string,
): z.output<S>[] {
  const out: z.output<S>[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) out.push(result.data);
    else report(table, row, result.error);
  }
  return out;
}

export function parseRow<S extends z.ZodType>(schema: S, row: unknown, table: string): z.output<S> | null {
  if (row == null) return null;
  return parseRows(schema, [row], table)[0] ?? null;
}
