// @ts-check
/** @type {import('jest').Config} */
const config = {
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          isolatedModules: true,
          // module: 'commonjs',
          // moduleResolution: 'node',
          // target: 'es2020',
          types: ['jest', 'node'],
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true
        },
        useESM: true
      }
    ],
    // Use babel-jest for javascript
    '^.+\\.(jsx|js|mjs|cjs)$': 'babel-jest'
  },
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.test.mjs'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,
  setupFiles: ['<rootDir>/jest.setup.js']
};

export default config;
