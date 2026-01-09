import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: ["daemon/dist/**", "daemon/node_modules/**", "daemon/coverage/**"],
  },
  {
    files: ["daemon/src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./daemon/tsconfig.json" },
    },
  },
  {
    files: ["daemon/src/**/*.ts"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
]);


