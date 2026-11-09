/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { build, defineConfig, loadEnv, type Plugin } from "vite";

// Values the app reads as process.env.* (kept from the Create React App
// days). Each is replaced at build time; unset ones become "".
const APP_ENV_KEYS = [
  "REACT_APP_BUILD_DATE",
  "REACT_APP_BUILD_VERSION",
  "REACT_APP_POSTHOG_KEY",
  "REACT_APP_POSTHOG_HOST",
];

const OUT_DIR = "build";

/**
 * Builds src/service-worker.ts into build/service-worker.js after the app
 * bundle is written, injecting the Workbox precache manifest
 * (self.__WB_MANIFEST) with every emitted file, the way CRA's
 * InjectManifest did.
 */
function serviceWorker(): Plugin {
  return {
    name: "yasa7-service-worker",
    apply: "build",
    async writeBundle(options, bundle) {
      const outDir = options.dir ?? path.resolve(OUT_DIR);
      const manifest = Object.keys(bundle)
        .filter((file) => !file.endsWith(".map"))
        .sort()
        .map((file) => ({
          url: "/" + file,
          // Hashed asset names already change with their contents.
          revision: file.startsWith("assets/")
            ? null
            : createHash("md5")
                .update(readFileSync(path.join(outDir, file)))
                .digest("hex"),
        }));

      await build({
        configFile: false,
        logLevel: "warn",
        publicDir: false,
        define: {
          "process.env.NODE_ENV": JSON.stringify("production"),
          "process.env.PUBLIC_URL": JSON.stringify(""),
          "self.__WB_MANIFEST": JSON.stringify(manifest),
        },
        build: {
          outDir,
          emptyOutDir: false,
          lib: {
            entry: path.resolve("src/service-worker.ts"),
            formats: ["iife"],
            name: "serviceWorker",
            fileName: () => "service-worker.js",
          },
        },
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");
  const define: Record<string, string> = {
    "process.env.PUBLIC_URL": JSON.stringify(""),
  };
  for (const key of APP_ENV_KEYS) {
    define[`process.env.${key}`] = JSON.stringify(env[key] ?? "");
  }

  return {
    plugins: [react(), serviceWorker()],
    define,
    server: { port: 3000 },
    build: { outDir: OUT_DIR },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/setupTests.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
