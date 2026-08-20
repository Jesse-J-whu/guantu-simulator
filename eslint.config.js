// ESLint 平面配置 — TypeScript + React。
// 风格基线对齐 Google JS Style Guide:2空格缩进、单引号、分号、no-var、camelCase。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'legacy', 'coverage', 'playwright-report'] },
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
      'react-refresh/only-export-components': 'off',
      // Google Style 核心项。
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      semi: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-new-func': 'error',
      camelcase: ['error', { properties: 'never' }], // 后端字段(snake_case)交互处放宽属性命名
      'dot-notation': 'error',
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
      // TS 专项。
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // 服务端 CJS 与脚本按 Node 环境校验。
    files: ['server/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      indent: ['error', 2],
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      semi: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
);
