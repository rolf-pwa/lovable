import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const MODULES = ["intake", "crm", "portal", "pro", "audit", "brain"];

// Modular monolith boundary: a module may import from `@/shared/*`, its own
// folder, and other modules' public barrels (`@/modules/<name>`) only.
// Deep imports into another module (`@/modules/<name>/...`) are errors.
const moduleBoundaryConfigs = MODULES.map((name) => ({
  files: [`src/modules/${name}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: MODULES.filter((other) => other !== name).map((other) => ({
          group: [`@/modules/${other}/*`],
          message: `Cross-module deep import. Import from "@/modules/${other}" (its public API) instead.`,
        })),
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Shared core must not depend on any feature module.
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*"],
              message:
                "src/shared must not depend on a feature module. Move the shared piece into src/shared, or invert the dependency.",
            },
          ],
        },
      ],
    },
  },
  ...moduleBoundaryConfigs,
);
