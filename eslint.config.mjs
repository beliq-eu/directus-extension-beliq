import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

// `src/api.ts` runs inside the user's Directus server, with that server's
// database handle and environment. So the security plugin runs at `error`, not
// at its own recommended `warn`, and `npm run lint` allows no warning either
// (`--max-warnings 0`).
export default defineConfig(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      // The rules that need types read them through `tsconfig.eslint.json`, the
      // one program that holds every file `eslint .` lints: src/, test/, the
      // root config files and, through `allowJs`, `examples/import.mjs` and
      // this file. `tsc` does not check that JavaScript (`checkJs` is off); it
      // types it.
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Every `security/*` rule is a gate, not a note.
      ...Object.fromEntries(
        Object.keys(security.rules).map((r) => [`security/${r}`, 'error']),
      ),
      '@typescript-eslint/no-explicit-any': 'error',
      // The next three need types. A promise that is left floating, or handed
      // to a callback that drops it, loses its rejection. A `switch` over a
      // union names every member, and a `default` does not stand in for one.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // A leading underscore marks a parameter that is unused on purpose, as
      // `noUnusedParameters` of `tsconfig.json` reads it.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // A test reads the example flows by a path built from this repo's tree (2
    // hits), and `examples/import.mjs` reads the flow file its caller names on
    // the command line (1 hit). Neither runs inside Directus. src/ keeps the
    // rule and has no hit.
    files: ['test/**', 'examples/**'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
);
