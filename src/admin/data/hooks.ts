/**
 * TanStack Query hooks for the admin. Every write invalidates the admin list and the
 * matching public queries, so the public site reflects changes immediately.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRepository } from '../repository';
import type {
  AdminTable,
  ListOptions,
  MessageQuery,
  MessageRow,
  MessageStatus,
  Row,
  Values,
} from '../repository/types';

export const adminKeys = {
  all: ['admin'] as const,
  list: (table: AdminTable, where?: ListOptions['where']) =>
    ['admin', table, 'list', where?.column ?? '', where?.value ?? ''] as const,
  table: (table: AdminTable) => ['admin', table] as const,
  row: (table: AdminTable, id: string) => ['admin', table, 'row', id] as const,
  settings: ['admin', 'settings'] as const,
  messages: ['admin', 'messages', 'new'] as const,
  inbox: ['admin', 'messages'] as const,
  inboxCounts: ['admin', 'messages', 'counts'] as const,
  inboxList: (q: MessageQuery) =>
    ['admin', 'messages', 'list', q.tab, q.kind ?? '', q.search ?? '', q.limit] as const,
  inboxRow: (id: string) => ['admin', 'messages', 'row', id] as const,
  files: ['admin', 'files'] as const,
};

export function invalidateTable(qc: QueryClient, table: AdminTable | 'site_settings') {
  if (table === 'site_settings') {
    void qc.invalidateQueries({ queryKey: adminKeys.settings });
    void qc.invalidateQueries({ queryKey: ['site_settings'] });
    return;
  }
  void qc.invalidateQueries({ queryKey: adminKeys.table(table) });
  void qc.invalidateQueries({ queryKey: ['published'] });
  if (table === 'custom_sections') void qc.invalidateQueries({ queryKey: adminKeys.table('custom_items') });
  if (table === 'projects') void qc.invalidateQueries({ queryKey: adminKeys.table('testimonials') });
}

export function useAdminList(table: AdminTable, where?: ListOptions['where']) {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.list(table, where),
    queryFn: () => repo.data.list(table, where ? { where } : undefined),
    staleTime: 0,
  });
}

export function useAdminRow(table: AdminTable, id: string | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.row(table, id ?? 'new'),
    queryFn: () => (id ? repo.data.get(table, id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useSettings() {
  const repo = useRepository();
  return useQuery({ queryKey: adminKeys.settings, queryFn: () => repo.data.getSettings(), staleTime: 0 });
}

/** Refreshes when you come back to the tab and every minute while the admin is open (IB-1). */
export function useNewMessageCount() {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.messages,
    queryFn: () => repo.data.countNewMessages(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/* ---------------- inbox (spec 07 §2.4) ---------------- */

export function useInboxCounts() {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.inboxCounts,
    queryFn: () => repo.messages.counts(),
    refetchInterval: 60_000,
  });
}

export function useInboxList(q: MessageQuery) {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.inboxList(q),
    queryFn: () => repo.messages.list(q),
    placeholderData: keepPreviousData,
  });
}

export function useMessage(id: string | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.inboxRow(id ?? ''),
    queryFn: () => repo.messages.get(id!),
    enabled: !!id,
  });
}

export function useSetMessageStatus() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MessageStatus; quiet?: boolean }) =>
      repo.messages.setStatus(id, status),
    onSuccess: (_r, { id, status, quiet }) => {
      qc.setQueryData<MessageRow | null>(adminKeys.inboxRow(id), (m) => (m ? { ...m, status } : m));
      // update the loaded lists in place, so the message keeps its place while you read it
      qc.setQueriesData<{ rows: MessageRow[]; total: number }>(
        { queryKey: [...adminKeys.inbox, 'list'] },
        (d) => (d ? { ...d, rows: d.rows.map((m) => (m.id === id ? { ...m, status } : m)) } : d),
      );
      if (quiet) {
        // opening a message: only the counts change; the list refreshes on its next fetch
        void qc.invalidateQueries({ queryKey: adminKeys.inboxCounts });
        void qc.invalidateQueries({ queryKey: adminKeys.messages });
      } else {
        void qc.invalidateQueries({ queryKey: adminKeys.inbox });
      }
    },
  });
}

export function useDeleteMessage() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.messages.remove(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: adminKeys.inboxRow(id) });
      void qc.invalidateQueries({ queryKey: adminKeys.inbox });
    },
  });
}

export function useCreateRow(table: AdminTable) {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Values) => repo.data.create(table, values),
    onSuccess: () => invalidateTable(qc, table),
  });
}

export function useUpdateRow(table: AdminTable) {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; values: Values; expectedUpdatedAt: string | null }) =>
      repo.data.update(table, v.id, v.values, v.expectedUpdatedAt),
    onSuccess: (row) => {
      qc.setQueryData(adminKeys.row(table, row.id), row);
      invalidateTable(qc, table);
    },
  });
}

export function useRemoveRow(table: AdminTable) {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.data.remove(table, id),
    onSuccess: () => invalidateTable(qc, table),
  });
}

/** Optimistic reorder: the list moves immediately and snaps back on failure (AD-11). */
export function useReorder(table: AdminTable, where?: ListOptions['where']) {
  const repo = useRepository();
  const qc = useQueryClient();
  const key = adminKeys.list(table, where);
  return useMutation({
    mutationFn: (ids: string[]) => repo.data.reorder(table, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Row[]>(key);
      if (previous) {
        const byId = new Map(previous.map((r) => [r.id, r]));
        qc.setQueryData<Row[]>(
          key,
          ids.map((id, i) => ({ ...byId.get(id)!, sort_order: i })),
        );
      }
      return { previous };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => invalidateTable(qc, table),
  });
}

export function useUpdateSettings() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { values: Values; expectedUpdatedAt: string | null }) =>
      repo.data.updateSettings(v.values, v.expectedUpdatedAt),
    onSuccess: (row) => {
      qc.setQueryData(adminKeys.settings, row);
      invalidateTable(qc, 'site_settings');
    },
  });
}
