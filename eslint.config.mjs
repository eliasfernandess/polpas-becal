import { defineConfig, globalIgnores } from "eslint/config";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
export default defineConfig([
  ...ts.configs.recommended,
  { files: ["src/**/*.tsx"], ...a11y.flatConfigs.recommended },
  { files: ["src/**/*.tsx"], plugins: { "react-hooks": hooks }, rules: hooks.configs.recommended.rules },
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);
