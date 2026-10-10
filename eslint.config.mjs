import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", ".next-stage8-failed-*/**", ".next-verify-*/**", "out/**", "src/generated/**", "next-env.d.ts", "test-results/**", ".browser-specs-local/**", ".playwright-preflight.config.ts"]),
]);
