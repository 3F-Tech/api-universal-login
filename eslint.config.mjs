// ESLint 10 usa flat config. O formato legado `.eslintrc.json` (citado no briefing)
// foi removido no ESLint 10, por isso a configuração vive aqui.
// Mantemos só dependências que já estão instaladas (sem @eslint/js / globals).
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/generated/**',
      'prisma/generated/**',
    ],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...(tsPlugin.configs?.recommended?.rules ?? {}),
      // TypeScript já cobre símbolos não definidos; evita falso-positivo com globais Node.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'prettier/prettier': 'warn',
    },
  },
  // Desliga regras de estilo que conflitam com o Prettier. Deve ser o último item.
  prettierConfig,
];
