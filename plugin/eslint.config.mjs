import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: ["plugin/dist/**", "plugin/node_modules/**", "plugin/coverage/**"],
  },
  {
    files: ["plugin/src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./plugin/tsconfig.json" },
    },
  },
  {
    files: ["plugin/src/**/*.ts"],
    rules: {
      // TypeScript handles undefined globals (no-undef false-positives for window/document/console/etc).
      "no-undef": "off",

      // Not part of the review bot signal; too noisy for our current workflow.
      "@typescript-eslint/no-deprecated": "off",

      // The Obsidian review bot focuses on plugin-specific rules + a small subset of TS rules.
      // These "unsafe" rules are extremely noisy in real-world Obsidian plugin code (events, DOM, CM internals).
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",

      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: ["Spark", "Spark Assistant", "Obsidian", "Claude", "CodeMirror"],
          acronyms: ["AI", "API", "PATH", "UUID", "PID", "JSONL"],
        },
      ],
    },
  },
]);


