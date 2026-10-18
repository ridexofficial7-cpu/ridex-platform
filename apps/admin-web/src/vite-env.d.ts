/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RIDEX_ENVIRONMENT?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_RIDEX_API_URL?: string;
  readonly VITE_RIDEX_TEST_API_URL?: string;
  readonly VITE_RIDEX_LIVE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RIDEX_APP_NAME?: string;
  readonly VITE_ENABLE_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
