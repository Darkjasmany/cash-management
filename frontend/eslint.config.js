import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
// 1. Importamos los nuevos integrantes
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    // 2. Agregamos el plugin de Prettier
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      prettier: prettierPlugin,
    },
    rules: {
      // 3. Activamos la regla que fuerza el formato de tu .prettierrc
      "prettier/prettier": ["warn"],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // 4. ESTO ES VITAL: Desactiva reglas de conflicto (siempre al final)
  prettierConfig,
]);
