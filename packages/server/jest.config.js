/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  // preset: 'ts-jest',
  // preset: 'ts-jest/presets/default-esm',
  // extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  // transform: {},
  verbose: true,
  transform: {
    '^.+\.m?tsx?$': [
      'ts-jest',
      {
        tsconfig: "./tsconfig.json",
        isolatedModules: true,
        useESM: true,
      },
    ],
  },
}


export default jestConfig;