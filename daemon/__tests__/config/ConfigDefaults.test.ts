import { DEFAULT_SPARK_CONFIG, deepMerge } from '../../src/config/ConfigDefaults.js';
import type { SparkConfig } from '../../src/types/config.js';

describe('ConfigDefaults', () => {
    describe('DEFAULT_SPARK_CONFIG', () => {
        it('should have valid daemon configuration', () => {
            expect(DEFAULT_SPARK_CONFIG.daemon.watch.patterns).toEqual(['**/*.md']);
            expect(DEFAULT_SPARK_CONFIG.daemon.watch.ignore).toContain('.git/**');
            expect(DEFAULT_SPARK_CONFIG.daemon.debounce_ms).toBe(300);
        });

        it('should have valid AI configuration', () => {
            expect(DEFAULT_SPARK_CONFIG.ai.defaultProvider).toBe('claude-agent');
            expect(DEFAULT_SPARK_CONFIG.ai.providers['claude-agent']!.model).toBe('claude-sonnet-4-5-20250929');
            expect(DEFAULT_SPARK_CONFIG.ai.providers['claude-agent']!.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
            expect(DEFAULT_SPARK_CONFIG.ai.providers['claude-client']!.model).toBe('claude-sonnet-4-5-20250929');
        });

        it('should have valid logging configuration', () => {
            expect(DEFAULT_SPARK_CONFIG.logging.level).toBe('info');
            expect(DEFAULT_SPARK_CONFIG.logging.file).toBeNull();
            expect(DEFAULT_SPARK_CONFIG.logging.console).toBe(true);
        });

        it('should have all features enabled by default', () => {
            expect(DEFAULT_SPARK_CONFIG.features.slash_commands).toBe(true);
            expect(DEFAULT_SPARK_CONFIG.features.chat_assistant).toBe(true);
            expect(DEFAULT_SPARK_CONFIG.features.trigger_automation).toBe(true);
        });
    });

    describe('deepMerge', () => {
        it('should merge simple objects', () => {
            const target = { a: 1, b: 2 };
            const source = { b: 3, c: 4 };
            const result = deepMerge(target, source);

            expect(result).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('should merge nested objects', () => {
            const target = {
                level1: {
                    level2: {
                        a: 1,
                        b: 2,
                    },
                },
            };
            const source = {
                level1: {
                    level2: {
                        b: 3,
                        c: 4,
                    },
                },
            };
            const result = deepMerge(target, source);

            expect(result).toEqual({
                level1: {
                    level2: {
                        a: 1,
                        b: 3,
                        c: 4,
                    },
                },
            });
        });

        it('should replace arrays instead of merging them', () => {
            const target = {
                patterns: ['*.md', '*.txt'],
            };
            const source = {
                patterns: ['**/*.md'],
            };
            const result = deepMerge(target, source);

            expect(result.patterns).toEqual(['**/*.md']);
            expect(result.patterns).not.toContain('*.txt');
        });

        it('should handle null values', () => {
            const target = { a: 1, b: null };
            const source = { b: 2, c: null };
            const result = deepMerge(target, source);

            expect(result).toEqual({ a: 1, b: 2, c: null });
        });

        it('should handle undefined values', () => {
            const target = { a: 1, b: undefined };
            const source = { b: 2, c: undefined };
            const result = deepMerge(target, source);

            expect(result).toEqual({ a: 1, b: 2, c: undefined });
        });

        it('should not mutate original objects', () => {
            const target = { a: 1, b: { c: 2 } };
            const source = { b: { d: 3 } };
            const result = deepMerge(target, source);

            expect(target).toEqual({ a: 1, b: { c: 2 } });
            expect(source).toEqual({ b: { d: 3 } });
            expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } });
        });

        it('should handle empty objects', () => {
            const result1 = deepMerge({}, { a: 1 });
            expect(result1).toEqual({ a: 1 });

            const result2 = deepMerge({ a: 1 }, {});
            expect(result2).toEqual({ a: 1 });

            const result3 = deepMerge({}, {});
            expect(result3).toEqual({});
        });

        it('should merge SparkConfig correctly', () => {
            const userConfig = {
                daemon: {
                    watch: {
                        patterns: ['custom/*.md'],
                        ignore: ['custom-ignore/**'],
                    },
                    debounce_ms: 500,
                },
                ai: {
                    providers: {
                        'claude-client': {
                            model: 'claude-3-opus-20240229',
                            apiKeyEnv: 'CUSTOM_API_KEY',
                            maxTokens: 8192,
                            temperature: 0.5,
                        },
                    },
                },
            };

            const result = deepMerge(
                DEFAULT_SPARK_CONFIG as unknown as Record<string, unknown>,
                userConfig as unknown as Record<string, unknown>
            ) as unknown as SparkConfig;

            // User config should override
            expect(result.daemon.watch.patterns).toEqual(['custom/*.md']);
            expect(result.daemon.debounce_ms).toBe(500);
            expect(result.ai.providers['claude-client']!.model).toBe('claude-3-opus-20240229');

            // Defaults should be preserved for unspecified fields
            expect(result.logging.level).toBe('info');
            expect(result.features.slash_commands).toBe(true);
        });

        it('should handle complex nested structures', () => {
            const target = {
                a: {
                    b: {
                        c: {
                            d: 1,
                            e: 2,
                        },
                        f: 3,
                    },
                    g: 4,
                },
                h: 5,
            };

            const source = {
                a: {
                    b: {
                        c: {
                            e: 20,
                            i: 30,
                        },
                    },
                },
            };

            const result = deepMerge(target, source);

            expect(result).toEqual({
                a: {
                    b: {
                        c: {
                            d: 1,
                            e: 20,
                            i: 30,
                        },
                        f: 3,
                    },
                    g: 4,
                },
                h: 5,
            });
        });

        it('should handle arrays at different nesting levels', () => {
            const target = {
                level1: {
                    arr1: [1, 2, 3],
                    level2: {
                        arr2: ['a', 'b'],
                    },
                },
            };

            const source = {
                level1: {
                    arr1: [4, 5],
                    level2: {
                        arr2: ['c'],
                    },
                },
            };

            const result = deepMerge(target, source) as typeof target;

            expect(result.level1.arr1).toEqual([4, 5]);
            expect(result.level1.level2.arr2).toEqual(['c']);
        });

        it('should handle boolean values', () => {
            const target = { flag1: true, flag2: false };
            const source = { flag2: true, flag3: false };
            const result = deepMerge(target, source);

            expect(result).toEqual({ flag1: true, flag2: true, flag3: false });
        });

        it('should handle string values', () => {
            const target = { str1: 'hello', str2: 'world' };
            const source = { str2: 'WORLD', str3: 'foo' };
            const result = deepMerge(target, source);

            expect(result).toEqual({ str1: 'hello', str2: 'WORLD', str3: 'foo' });
        });

        it('should handle number values', () => {
            const target = { num1: 100, num2: 200 };
            const source = { num2: 300, num3: 400 };
            const result = deepMerge(target, source);

            expect(result).toEqual({ num1: 100, num2: 300, num3: 400 });
        });
    });
});

