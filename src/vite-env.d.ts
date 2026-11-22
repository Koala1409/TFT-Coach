/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public URL of a remote comps.json (e.g. a GitHub Raw URL). Optional.
   * NOTE: every VITE_* variable is inlined into the client bundle — never put secrets here.
   */
  readonly VITE_META_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
