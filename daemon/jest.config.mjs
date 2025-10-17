/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    injectGlobals: true,
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
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
        '!src/types/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 75,
            functions: 75,
            lines: 78,
            statements: 78,
        },
    },
    testTimeout: 10000,
};

