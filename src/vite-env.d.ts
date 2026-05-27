/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GIF_API_KEY: string;
  readonly VITE_GIF_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}