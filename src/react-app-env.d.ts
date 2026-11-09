/// <reference types="vite/client" />

// process.env.* values replaced at build time (see `define` in vite.config.ts).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PUBLIC_URL: string;
    readonly REACT_APP_BUILD_DATE?: string;
    readonly REACT_APP_BUILD_VERSION?: string;
    readonly REACT_APP_POSTHOG_KEY?: string;
    readonly REACT_APP_POSTHOG_HOST?: string;
  }
}
