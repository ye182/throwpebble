/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_DIARY_API_BASE?: string;
  /** Set to "true" for GitHub Pages static hosting (browser-only auth). */
  readonly VITE_STATIC_DEPLOY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
