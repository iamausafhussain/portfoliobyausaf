/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** '1' runs the admin against the in-memory demo backend (dev only). */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The commit this build was made from ("local" outside Netlify) (spec 09 OP-3). */
declare const __BUILD_ID__: string;
/** When this build was made, ISO time (spec 09 OP-5). */
declare const __BUILD_TIME__: string;
