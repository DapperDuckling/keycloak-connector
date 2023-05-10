/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
    displayName: 'keycloak-connector-server',
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
}

export default jestConfig;