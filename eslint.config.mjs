import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
  ]),
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      // Fetch state and request counters intentionally synchronize from effects.
      // This project does not enable React Compiler's optional optimization pass.
      "react-hooks/set-state-in-effect": "off",
      // Authenticated images must go directly through the protected file endpoint.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
