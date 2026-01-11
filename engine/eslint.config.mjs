import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: ["engine/dist/**", "engine/node_modules/**", "engine/coverage/**"],
  },
  {
    files: ["engine/src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./engine/tsconfig.json" },
    },
  },
  {
    files: ["engine/src/**/*.ts"],
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


