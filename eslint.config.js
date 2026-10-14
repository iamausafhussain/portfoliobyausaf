import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', '.pgtest', 'src/data/database.types.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // master spec §13: no `any` without a comment explaining why
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Providers and route modules export hooks/loaders next to components on purpose; fast refresh is a dev nicety.
    files: [
      'src/admin/**/*.{ts,tsx}',
      'src/theme/**/*.tsx',
      'src/shell/**/*.tsx',
      'src/device/**/*.tsx',
      'src/motion/**/*.tsx',
      'src/chapters/**/*.tsx',
      'src/cursor/**/*.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
);
