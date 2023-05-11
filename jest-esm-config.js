// noinspection JSFileReferences
import pkg from 'ts-jest/presets/index.js';
const {defaultsESM: tsjPreset} = pkg;

// Override noEmitOnError setting
Object.values(tsjPreset.transform).map(rules => {
    if (rules[1] === undefined) return;

    rules[1].tsconfig = {
        ...rules[1].tsconfig,
        noEmitOnError: false,
    };
});

/** @type {import('ts-jest').JestConfigWithTsJest} */
const esmConfig = {
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    ...tsjPreset,
}

export default esmConfig;