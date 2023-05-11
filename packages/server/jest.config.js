import esmConfig from "../../jest-esm-config.js";

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
    displayName: 'keycloak-connector-server',
    testEnvironment: 'node',
    ...esmConfig,
}

export default jestConfig;