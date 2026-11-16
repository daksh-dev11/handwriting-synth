import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.kilo/**'] },
  {
    files: ['*.js', '*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' },
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^(?!\\.{1,2}/).*', message: 'engine: relative only' }],
          paths: [{ name: 'pdf-lib', message: 'worker-side only' }],
        },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/engine',
              from: ['./src/worker', './src/pdf', './src/canvas', './src/components', './src/store', './tests'],
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'self',
        'globalThis',
        'navigator',
        'performance',
        'indexedDB',
        'localStorage',
        'sessionStorage',
        'fetch',
        'Worker',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
        'console',
        'TextEncoder',
        'TextDecoder',
        'crypto',
        'structuredClone',
        'process',
        'require',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'use hash32/u01/gauss' },
        { object: 'Date', property: 'now', message: 'pass time in as an argument' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'pass time in as an argument' },
      ],
    },
  },
  {
    files: ['src/{components,canvas,store}/**/*.{ts,tsx}', 'src/worker/{client,protocol}.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^@engine/.+', message: "import from '@engine' only" }],
          paths: [{ name: 'pdf-lib', message: 'worker-side only' }],
        },
      ],
    },
  },
  {
    files: ['src/pdf/**/*.ts', 'src/worker/**/*.ts'],
    ignores: ['src/worker/{client,protocol}.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^@engine/.+', message: "import from '@engine' only" }],
        },
      ],
    },
  },
];