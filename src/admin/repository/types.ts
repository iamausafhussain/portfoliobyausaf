/**
 * The admin talks to its backend only through this interface (spec 02 §3.3).
 *  - SupabaseRepository: production; security enforced by RLS.
 *  - DemoRepository: dev only (VITE_DEMO=1); in-memory, same validation rules.
 */

/** Tables the admin lists and edits row by row. */
export type AdminTable =
  | 'hero_media'
  | 'projects'
  | 'achievements'
  | 'experience'
  | 'skills'
  | 'testimonials'
  | 'custom_sections'
  | 'custom_items';

export const adminTables: readonly AdminTable[] = [
  'hero_media',
  'projects',
  'achievements',
  'experience',
  'skills',
  'testimonials',
  'custom_sections',
  'custom_items',
];

export type Bucket = 'images' | 'videos' | 'documents';
export const buckets: readonly Bucket[] = ['images', 'videos', 'documents'];

/** A database row as the admin sees it. Typed views are produced with the Zod schemas. */
export type Row = Record<string, unknown> & { id: string; updated_at: string };
export type SettingsRow = Record<string, unknown> & { id: 1; updated_at: string };
export type Values = Record<string, unknown>;

export type AuthStatus =
  | 'signed_out'
  | 'needs_setup' // password OK, no authenticator yet
  | 'needs_code' // password OK, authenticator exists, code not entered
  | 'not_owner' // signed in, but not the owner account
  | 'signed_in'; // owner with a two-factor session

export interface AuthState {
  status: AuthStatus;
  email?: string;
}

export interface TotpSetup {
  factorId: string;
  /** otpauth:// link: encoded as the QR code, and opens the authenticator app on a phone */
  uri: string;
  /** Base32 secret for manual entry */
  secret: string;
}

export interface Authenticator {
  id: string;
  name: string;
  createdAt: string;
}

export interface AuthApi {
  getState(): Promise<AuthState>;
  onChange(listener: () => void): () => void;
  signIn(email: string, password: string): Promise<AuthState>;
  startTotpSetup(name?: string): Promise<TotpSetup>;
  finishTotpSetup(factorId: string, code: string): Promise<void>;
  verifyCode(code: string): Promise<void>;
  listAuthenticators(): Promise<Authenticator[]>;
  removeAuthenticator(id: string): Promise<void>;
  /** Used after a password-reset link (recovery session) and from the Account page. */
  changePassword(newPassword: string): Promise<void>;
  /** True when the current session still needs a code before the password can change. */
  passwordChangeNeedsCode(): Promise<boolean>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  signOut(scope: 'local' | 'global'): Promise<void>;
  /** True once migration 0008 (two-factor enforced by the database) is applied. */
  mfaEnforced(): Promise<boolean>;
}

export interface ListOptions {
  /** Only rows where column = value (e.g. custom_items by section_id). */
  where?: { column: string; value: string };
}

export interface DataApi {
  /** All rows including drafts, in display order. */
  list(table: AdminTable, options?: ListOptions): Promise<Row[]>;
  get(table: AdminTable, id: string): Promise<Row | null>;
  create(table: AdminTable, values: Values): Promise<Row>;
  /**
   * Saves only if the row's updated_at still equals `expectedUpdatedAt`
   * (spec 02 AD-24). Pass null to overwrite regardless.
   */
  update(table: AdminTable, id: string, values: Values, expectedUpdatedAt: string | null): Promise<Row>;
  remove(table: AdminTable, id: string): Promise<void>;
  reorder(table: AdminTable, ids: string[]): Promise<void>;
  getSettings(): Promise<SettingsRow>;
  updateSettings(values: Values, expectedUpdatedAt: string | null): Promise<SettingsRow>;
  countNewMessages(): Promise<number>;
}

export interface UploadOptions {
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface StoredFile {
  /** Stored path including the bucket, e.g. "images/projects/2b1f.webp" */
  path: string;
  size: number;
  contentType: string;
  updatedAt: string;
}

export interface FilesApi {
  /** Uploads and returns the stored path ("<bucket>/<objectPath>"). */
  upload(bucket: Bucket, objectPath: string, file: Blob, options: UploadOptions): Promise<string>;
  remove(paths: string[]): Promise<void>;
  listAll(bucket: Bucket): Promise<StoredFile[]>;
  /** Browser-loadable URL for a stored path or an external https URL. */
  url(path: string): string;
}

export type MessageStatus = 'new' | 'read' | 'replied' | 'archived';
export type MessageKind = 'hire' | 'freelance' | 'collab' | 'general';
/** Inbox tabs: a status, or "all" (everything except archived) (spec 07 IB-3). */
export type MessageTab = MessageStatus | 'all';
export const messageTabs: readonly MessageTab[] = ['new', 'read', 'replied', 'archived', 'all'];

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  kind: MessageKind;
  subject: string;
  body: string;
  budget: string | null;
  status: MessageStatus;
  created_at: string;
}

export interface MessageQuery {
  tab: MessageTab;
  kind?: MessageKind | null;
  /** Matched against name, email, subject and message, ignoring case. */
  search?: string;
  /** Newest first, this many (IB-2: 50 at a time). */
  limit: number;
}

export interface MessagesApi {
  list(query: MessageQuery): Promise<{ rows: MessageRow[]; total: number }>;
  counts(): Promise<Record<MessageTab, number>>;
  get(id: string): Promise<MessageRow | null>;
  /** The only change the owner can make to a message (spec 01). */
  setStatus(id: string, status: MessageStatus): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface AdminRepository {
  kind: 'supabase' | 'demo';
  /** Shown on the login screen (demo mode only). */
  loginHint?: string;
  auth: AuthApi;
  data: DataApi;
  files: FilesApi;
  messages: MessagesApi;
}
