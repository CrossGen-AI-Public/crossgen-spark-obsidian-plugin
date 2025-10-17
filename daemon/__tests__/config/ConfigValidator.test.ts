import { ConfigValidator } from '../../src/config/ConfigValidator.js';
import { DEFAULT_SPARK_CONFIG } from '../../src/config/ConfigDefaults.js';
import type { SparkConfig } from '../../src/types/config.js';
import { SparkError } from '../../src/types/index.js';

describe('ConfigValidator', () => {
    let validator: ConfigValidator;

    beforeEach(() => {
        validator = new ConfigValidator();
    });

    describe('validate', () => {
        it('should validate default config successfully', () => {
            expect(() => validator.validate(DEFAULT_SPARK_CONFIG)).not.toThrow();
        });

        it('should return validated config', () => {
            const result = validator.validate(DEFAULT_SPARK_CONFIG);
            expect(result).toEqual(DEFAULT_SPARK_CONFIG);
        });

        describe('daemon.watch validation', () => {
            it('should validate patterns array', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        watch: {
                            patterns: ['**/*.md', '**/*.txt'],
                            ignore: ['.git/**'],
                        },
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });

            it('should throw if daemon.watch is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        debounce_ms: 300,
                    },
                };

                expect(() => validator.validate(config as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as SparkConfig)).toThrow('daemon.watch is required');
            });

            it('should throw if patterns is not an array', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        watch: {
                            patterns: '**/*.md',
                            ignore: ['.git/**'],
                        },
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(
                    'daemon.watch.patterns must be a non-empty array'
                );
            });

            it('should throw if patterns is empty', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        watch: {
                            patterns: [],
                            ignore: ['.git/**'],
                        },
                    },
                };

                expect(() => validator.validate(config)).toThrow(SparkError);
                expect(() => validator.validate(config)).toThrow('daemon.watch.patterns must be a non-empty array');
            });

            it('should throw if ignore is not an array', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        watch: {
                            patterns: ['**/*.md'],
                            ignore: '.git/**',
                        },
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(
                    'daemon.watch.ignore must be an array'
                );
            });
        });

        describe('daemon.debounce_ms validation', () => {
            it('should accept valid debounce values', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        debounce_ms: 500,
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });

            it('should throw if debounce_ms is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        watch: DEFAULT_SPARK_CONFIG.daemon.watch,
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(
                    'daemon.debounce_ms is required'
                );
            });

            it('should throw if debounce_ms is not a number', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    daemon: {
                        ...DEFAULT_SPARK_CONFIG.daemon,
                        debounce_ms: '300',
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(
                    'daemon.debounce_ms is required'
                );
            });
        });

        describe('ai validation', () => {
            it('should validate Claude AI config', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    ai: {
                        provider: 'claude' as const,
                        claude: {
                            model: 'claude-3-opus-20240229',
                            api_key_env: 'ANTHROPIC_API_KEY',
                            max_tokens: 8192,
                            temperature: 0.7,
                        },
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });

            it('should throw if ai is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    ai: undefined,
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow('ai');
            });

            it('should throw if ai.provider is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    ai: {
                        claude: DEFAULT_SPARK_CONFIG.ai.claude,
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow('ai.provider is required');
            });

            it('should throw if ai.claude is missing when provider is claude', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    ai: {
                        provider: 'claude' as const,
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow('ai.claude');
            });
        });

        describe('logging validation', () => {
            it('should validate logging config', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    logging: {
                        level: 'debug' as const,
                        file: '/path/to/log.txt',
                        console: false,
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });

            it('should throw if logging is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    logging: undefined,
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow('logging');
            });

            it('should throw if logging.level is invalid', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    logging: {
                        ...DEFAULT_SPARK_CONFIG.logging,
                        level: 'invalid',
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(
                    'logging.level must be one of: debug, info, warn, error'
                );
            });

            it('should accept null for logging.file', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    logging: {
                        ...DEFAULT_SPARK_CONFIG.logging,
                        file: null,
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });
        });

        describe('features validation', () => {
            it('should validate features config', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    features: {
                        slash_commands: false,
                        chat_assistant: true,
                        trigger_automation: false,
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
            });

            it('should throw if features is missing', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    features: undefined,
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow('features');
            });

            it('should throw if feature flags are not booleans', () => {
                const config = {
                    ...DEFAULT_SPARK_CONFIG,
                    features: {
                        slash_commands: 'true',
                        chat_assistant: true,
                        trigger_automation: true,
                    },
                };

                expect(() => validator.validate(config as unknown as SparkConfig)).toThrow(SparkError);
            });
        });

        describe('edge cases', () => {
            it('should throw for null config', () => {
                expect(() => validator.validate(null as unknown as SparkConfig)).toThrow(SparkError);
            });

            it('should throw for undefined config', () => {
                expect(() => validator.validate(undefined as unknown as SparkConfig)).toThrow(SparkError);
            });

            it('should throw for empty object', () => {
                expect(() => validator.validate({} as SparkConfig)).toThrow(SparkError);
            });

            it('should throw for non-object types', () => {
                expect(() => validator.validate('invalid' as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(123 as unknown as SparkConfig)).toThrow(SparkError);
                expect(() => validator.validate(true as unknown as SparkConfig)).toThrow(SparkError);
            });
        });

        describe('comprehensive validation', () => {
            it('should validate a complete custom config', () => {
                const config: SparkConfig = {
                    version: '1.0',
                    daemon: {
                        watch: {
                            patterns: ['notes/**/*.md', 'docs/**/*.md'],
                            ignore: ['.git/**', 'node_modules/**', '.obsidian/**'],
                        },
                        debounce_ms: 500,
                        status_indicators: {
                            enabled: true,
                            pending: '',
                            processing: '⏳',
                            completed: '✅',
                            error: '❌',
                            warning: '⚠️',
                        },
                        results: {
                            mode: 'auto',
                            inline_max_chars: 500,
                            separate_folder: 'reports/',
                            add_blank_lines: true,
                        },
                    },
                    ai: {
                        provider: 'claude',
                        claude: {
                            model: 'claude-3-opus-20240229',
                            api_key_env: 'MY_CLAUDE_KEY',
                            max_tokens: 8192,
                            temperature: 0.8,
                        },
                    },
                    logging: {
                        level: 'debug',
                        file: '/var/log/spark-daemon.log',
                        console: true,
                    },
                    features: {
                        slash_commands: true,
                        chat_assistant: true,
                        trigger_automation: false,
                    },
                };

                expect(() => validator.validate(config)).not.toThrow();
                const result = validator.validate(config);
                expect(result).toEqual(config);
            });
        });
    });
});

