/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    injectGlobals: true,
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@lmstudio/sdk$': '<rootDir>/__tests__/setup/__mocks__/lmstudio-sdk.ts',
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    isolatedModules: true,
                },
            },
        ],
    },
    testMatch: [
        '**/__tests__/**/*.test.ts',
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts',
        '!src/cli.ts',
        '!src/types/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    coverageThreshold: {
        global: {
            branches: 35,
            functions: 45,
            lines: 45,
            statements: 45,
        },
    },
    testTimeout: 10000,
};

