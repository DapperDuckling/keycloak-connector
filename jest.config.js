/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
    projects: ['./packages/*'],
    globalSetup: "./jest-seed-setup.js",
}

export default jestConfig;