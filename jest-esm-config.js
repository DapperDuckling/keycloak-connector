/** @type {import('ts-jest').JestConfigWithTsJest} */
const esmConfig = {
    preset: 'ts-jest/presets/default-esm',
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
}

export default esmConfig;