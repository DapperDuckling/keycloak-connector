import type { JestConfigWithTsJest } from 'ts-jest'

const jestConfig: JestConfigWithTsJest = {
  projects: ['./packages/client', './packages/server'],
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest configuration goes here
      },
    ],
  },
  testEnvironment: 'node',
  preset: 'ts-jest',
}

// module.exports = {
//   preset: 'ts-jest',
//   testEnvironment: 'node',
// };

export default jestConfig;