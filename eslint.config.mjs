import baseConfig from '@dimaslanjaka/eslint-base-config';

/** @type {import('eslint').Linter.Config} */
export default [
  ...baseConfig,
  { ignores: ['**/dist/**', '**/.cache/**', '**/coverage/**', '**/node_modules/**', '**/tmp/**'] }
];
