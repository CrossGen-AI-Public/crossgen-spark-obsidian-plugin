import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
	js.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				project: './tsconfig.json',
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				document: 'readonly',
				window: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': typescript,
		},
		rules: {
			// TypeScript rules
			'@typescript-eslint/no-explicit-any': 'error', // Never use any!
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
			}],
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/await-thenable': 'error',

			// General rules
			'no-console': 'off', // Allow console.log for debugging
			'no-unused-vars': 'error',
			'prefer-const': 'error',
			'no-var': 'error',
		},
	},
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'*.js',
			'*.mjs',
		],
	},
];

