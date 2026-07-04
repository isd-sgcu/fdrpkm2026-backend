import js from "@eslint/js";
import tseslint from "typescript-eslint";
import drizzle from "eslint-plugin-drizzle";

export default tseslint.config(
  {
    ignores: [".agents", "dist", "node_modules", "coverage", "bun.lockb"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware parsing only for files tsconfig.json actually covers
    // (see its "include") — eslint.config.js/drizzle.config.ts aren't in
    // it, and pointing "project" at files outside it is a parse error.
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    plugins: {
      drizzle
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports"
        }
      ],
      "drizzle/enforce-delete-with-where": "error",
      "drizzle/enforce-update-with-where": "error"
    }
  }
);
