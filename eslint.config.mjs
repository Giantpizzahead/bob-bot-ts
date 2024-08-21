// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules", "dist", "old", "docs"] }, // Don't lint external modules or built .js files
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node, // Include globals like process and console
      },
    },
    rules: {
      semi: ["error", "always"], // Enforce semicolons
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
