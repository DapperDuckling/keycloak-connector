/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
    displayName: 'keycloak-connector-client',
    preset: 'ts-jest/presets/default-esm',
    modulePaths: ["<rootDir>/src/"],
    testEnvironment: 'node'
}

export default jestConfig;