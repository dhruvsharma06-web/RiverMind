import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".venv/**",
    "test-results/**",
    "playwright-report/**",
    ".qa/**",
    ".next/**",
    ".npm-cache/**",
    "out/**",
    "coverage/**",
    "public/fixtures/**",
    "next-env.d.ts",
  ]),
]);
