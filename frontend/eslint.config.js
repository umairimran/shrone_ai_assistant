import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import testingLibrary from 'eslint-plugin-testing-library';

const nextRules = {
  ...nextPlugin.configs.recommended.rules,
  ...nextPlugin.configs['core-web-vitals'].rules
};

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@next/next': nextPlugin
    },
    rules: {
      ...nextRules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    plugins: {
      'testing-library': testingLibrary
    },
    rules: {
      'testing-library/no-node-access': 'off'
    }
  },
  {
    ignores: ['node_modules/**/*', '.next/**/*']
  }
];
