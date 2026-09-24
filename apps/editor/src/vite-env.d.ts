/// <reference types="vite/client" />

declare const __XPRITE_VERSION__: string;
declare const __XPRITE_RELEASE__: string;
declare const __XPRITE_ITCH__: boolean;

interface ImportMetaEnv {
  readonly VITE_EMBEDDED_HOST?: string;
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_REGION?: "US" | "EU";
}

declare module "*.aseprite?url" {
  const source: string;
  export default source;
}
