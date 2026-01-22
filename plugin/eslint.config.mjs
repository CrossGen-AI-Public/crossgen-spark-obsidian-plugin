import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: ["plugin/dist/**", "plugin/node_modules/**", "plugin/coverage/**"],
  },
  {
    files: ["plugin/src/**/*.ts", "plugin/src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./plugin/tsconfig.json" },
    },
  },
  {
    files: ["plugin/src/**/*.ts", "plugin/src/**/*.tsx"],
    rules: {
      // TypeScript handles undefined globals (no-undef false-positives for window/document/console/etc).
      "no-undef": "off",

      // The Obsidian review bot focuses on plugin-specific rules + a small subset of TS rules.
      // These "unsafe" rules are extremely noisy in real-world Obsidian plugin code (events, DOM, CM internals).
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",

      // Ensure async functions actually use await (catches unnecessary async keywords)
      "@typescript-eslint/require-await": "error",

      // Use defaults for brands/acronyms to match the Obsidian review bot
      "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true, allowAutoFix: true }],
    },
  },
]);


