/**
 * Turns database, storage and network errors into plain messages (spec 02 §3.6).
 */
import type { AdminTable } from './types';

export type RepoErrorKind =
  'conflict' | 'unique' | 'invalid' | 'auth' | 'not_found' | 'network' | 'file' | 'credentials' | 'unknown';

export class RepoError extends Error {
  readonly kind: RepoErrorKind;
  /** Form field the error belongs to, when known. */
  readonly field?: string;

  constructor(kind: RepoErrorKind, message: string, field?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepoError';
    this.kind = kind;
    this.field = field;
  }
}

export const isRepoError = (e: unknown): e is RepoError => e instanceof RepoError;

export const entityNames: Record<AdminTable | 'site_settings', string> = {
  hero_media: 'hero clip',
  projects: 'project',
  achievements: 'achievement',
  experience: 'role',
  skills: 'skill',
  testimonials: 'testimonial',
  custom_sections: 'section',
  custom_items: 'item',
  site_settings: 'settings',
};

const fieldLabels: Record<string, string> = {
  slug: 'Web address',
  title: 'Title',
  summary: 'Summary',
  name: 'Name',
  quote: 'Quote',
  cover: 'Cover image',
  poster: 'Poster',
  video_mp4: 'Video',
  end_date: 'End date',
  fields: 'Fields',
  insert_after: 'Position',
  public_email: 'Public email',
  socials: 'Social links',
  links: 'Links',
  globe: 'Globe position',
};

/** Named constraints that don't follow the <table>_<column>_check pattern. */
const constraintFields: Record<string, string> = {
  hero_media_sources_match_type: 'video_mp4',
  experience_dates_ordered: 'end_date',
  custom_sections_not_after_contact: 'insert_after',
  projects_slug_key: 'slug',
  custom_sections_slug_key: 'slug',
  skills_name_unique_ci: 'name',
};

export function labelFor(field: string): string {
  return fieldLabels[field] ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function fieldFromConstraint(constraint: string, table: string): string | undefined {
  if (constraintFields[constraint]) return constraintFields[constraint];
  const m = new RegExp(`^${table}_(.+)_(check|key)$`).exec(constraint);
  return m?.[1];
}

export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  status?: number;
}

/** Map a PostgREST / Postgres error to a RepoError. */
export function mapDbError(error: DbErrorLike, table: AdminTable | 'site_settings'): RepoError {
  const code = error.code ?? '';
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  const constraint = /constraint "([^"]+)"/.exec(text)?.[1] ?? '';
  const field = constraint ? fieldFromConstraint(constraint, table) : undefined;
  const entity = entityNames[table];

  if (code === '23505') {
    if (field === 'slug')
      return new RepoError('unique', `That web address is already used by another ${entity}.`, 'slug');
    if (table === 'skills')
      return new RepoError('unique', 'You already have a skill with that name.', 'name');
    return new RepoError('unique', `Another ${entity} already uses that value.`, field);
  }
  if (code === '23514' || code === '22P02' || code === '23502' || code === '22001') {
    const label = field ? labelFor(field) : 'One of the values';
    return new RepoError('invalid', `${label} isn't valid.`, field);
  }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || error.status === 401) {
    return new RepoError('auth', 'Your session has expired — sign in again.');
  }
  if (code === 'PGRST116') return new RepoError('not_found', `This ${entity} no longer exists.`);
  return new RepoError('unknown', error.message || 'Something went wrong. Please try again.', undefined, {
    cause: error,
  });
}

export function networkError(cause: unknown): RepoError {
  return new RepoError(
    'network',
    "Couldn't reach the server. Check your connection and try again.",
    undefined,
    {
      cause,
    },
  );
}

export function conflictError(): RepoError {
  return new RepoError('conflict', 'This was changed somewhere else — reload to see the latest version.');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
