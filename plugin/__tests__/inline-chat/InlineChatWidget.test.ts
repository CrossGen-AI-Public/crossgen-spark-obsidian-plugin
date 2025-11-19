import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InlineChatWidget } from '../../src/inline-chat/InlineChatWidget';
import type { App } from 'obsidian';
import type { MentionDecorator } from '../../src/command-palette/MentionDecorator';

// Mock App with necessary methods
const createMockApp = (): App => {
    return {
        // Add any necessary app methods here
        vault: {
            getMarkdownFiles: () => [],
        },
    } as any;
};

// Mock MentionDecorator
const createMockMentionDecorator = (): MentionDecorator => {
    return {
        initialize: async () => { },
        refresh: async () => { },
    } as any;
};

// Mock DOM element
const createMockElement = (): HTMLElement => {
    const element = document.createElement('div');
    element.style.position = 'relative';
    element.style.width = '800px';
    element.style.height = '600px';
    return element;
};

describe('InlineChatWidget', () => {
    let mockApp: App;
    let mockMentionDecorator: MentionDecorator;
    let parentElement: HTMLElement;

    beforeEach(() => {
        // Mock setIcon function used by Obsidian
        (global as any).setIcon = jest.fn();

        // Add Obsidian's custom HTML element methods
        HTMLElement.prototype.addClass = function (this: HTMLElement, className: string) {
            this.classList.add(className);
        };

        HTMLElement.prototype.createDiv = function (this: HTMLElement, options?: any) {
            const div = document.createElement('div');
            if (typeof options === 'string') {
                div.className = options;
            } else if (options) {
                if (options.cls) div.className = options.cls;
                if (options.text) div.textContent = options.text;
                if (options.attr) {
                    for (const [key, value] of Object.entries(options.attr)) {
                        div.setAttribute(key, value as string);
                    }
                }
            }
            this.appendChild(div);
            return div;
        };

        HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
            this: HTMLElement,
            tag: K,
            options?: any
        ): HTMLElementTagNameMap[K] {
            const el = document.createElement(tag);
            if (options) {
                if (options.cls) el.className = options.cls;
                if (options.text) el.textContent = options.text;
                if (options.attr) {
                    for (const [key, value] of Object.entries(options.attr)) {
                        el.setAttribute(key, value as string);
                    }
                }
            }
            this.appendChild(el);
            return el as HTMLElementTagNameMap[K];
        };

        HTMLElement.prototype.setText = function (this: HTMLElement, text: string) {
            this.textContent = text;
        };

        HTMLElement.prototype.empty = function (this: HTMLElement) {
            this.innerHTML = '';
        };

        mockApp = createMockApp();
        mockMentionDecorator = createMockMentionDecorator();
        parentElement = createMockElement();
        document.body.appendChild(parentElement);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete (global as any).setIcon;
        // Clean up prototypes
        delete (HTMLElement.prototype as any).addClass;
        delete (HTMLElement.prototype as any).createDiv;
        delete (HTMLElement.prototype as any).createEl;
        delete (HTMLElement.prototype as any).setText;
        delete (HTMLElement.prototype as any).empty;
    });

    describe('Widget Creation', () => {
        it('should create widget with agent name', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            expect(widget.isVisible()).toBe(true);
        });

        it('should position widget correctly', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'bob',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 200,
                left: 100,
                parentElement,
            });

            widget.show();

            const container = parentElement.querySelector('.spark-inline-chat-widget') as HTMLElement;
            expect(container).not.toBeNull();
            expect(container?.style.top).toBe('200px');
            expect(container?.style.left).toBe('100px');
        });

        it('should create mention input for input', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input');
            expect(mentionInput).not.toBeNull();
        });

        it('should create send button', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const sendButton = parentElement.querySelector('.spark-inline-chat-send-btn');

            expect(sendButton).not.toBeNull();
            expect(sendButton?.innerHTML).toBe('↑');
        });

        it('should create close button', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const closeButton = parentElement.querySelector('.spark-inline-chat-close-btn');

            expect(closeButton).not.toBeNull();
            expect(closeButton?.innerHTML).toBe('×');
        });
    });

    describe('Widget Interactions', () => {
        it('should call onSend when send button clicked', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input') as HTMLDivElement;
            const sendButton = parentElement.querySelector('.spark-inline-chat-send-btn') as HTMLButtonElement;

            mentionInput.textContent = 'test message';
            // Trigger input event to enable button
            mentionInput.dispatchEvent(new Event('input', { bubbles: true }));
            sendButton.click();

            expect(onSend).toHaveBeenCalledWith('test message');
        });

        it('should disable send button when input is empty', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const sendButton = parentElement.querySelector('.spark-inline-chat-send-btn') as HTMLButtonElement;

            // Button should be disabled initially (no input)
            expect(sendButton.disabled).toBe(true);
        });

        it('should call onCancel when close button clicked', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const closeButton = parentElement.querySelector('.spark-inline-chat-close-btn') as HTMLButtonElement;
            closeButton.click();

            expect(onCancel).toHaveBeenCalled();
        });

        it('should send message on Enter key', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input') as HTMLDivElement;
            mentionInput.textContent = 'test message';

            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
            mentionInput.dispatchEvent(enterEvent);

            expect(onSend).toHaveBeenCalledWith('test message');
        });

        it('should NOT send message on Shift+Enter', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input') as HTMLDivElement;
            mentionInput.textContent = 'test message';

            const shiftEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
            mentionInput.dispatchEvent(shiftEnterEvent);

            expect(onSend).not.toHaveBeenCalled();
        });

        it('should cancel on Escape key', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input') as HTMLDivElement;

            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            mentionInput.dispatchEvent(escapeEvent);

            expect(onCancel).toHaveBeenCalled();
        });

        it('should not send empty messages', () => {
            const onSend = jest.fn();
            const onCancel = jest.fn();

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend,
                onCancel,
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            const mentionInput = parentElement.querySelector('.spark-mention-input') as HTMLDivElement;
            const sendButton = parentElement.querySelector('.spark-inline-chat-send-btn') as HTMLButtonElement;

            mentionInput.textContent = '   '; // Only whitespace
            mentionInput.dispatchEvent(new Event('input', { bubbles: true }));
            sendButton.click();

            expect(onSend).not.toHaveBeenCalled();
            // Button should remain disabled for whitespace-only input
            expect(sendButton.disabled).toBe(true);
        });
    });

    describe('Processing State', () => {
        it('should transform to processing state', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();
            widget.transformToProcessing('What is burn rate?');

            const userMessage = parentElement.querySelector('.spark-inline-chat-user-message');
            const statusMessage = parentElement.querySelector('.spark-inline-chat-status-message');
            const jumpingDots = parentElement.querySelector('.spark-jumping-dots');

            expect(userMessage?.textContent).toBe('What is burn rate?');
            expect(statusMessage?.textContent).toBe('Alice is typing');
            expect(jumpingDots).not.toBeNull();
        });

        it('should show status messages in processing state', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();
            widget.transformToProcessing('test message');

            const statusMessage = parentElement.querySelector('.spark-inline-chat-status-message');
            expect(statusMessage?.textContent).toBeTruthy();
        });

        it('should not show mention input in processing state', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();
            widget.transformToProcessing('test message');

            const mentionInput = parentElement.querySelector('.spark-mention-input');
            expect(mentionInput).toBeNull();
        });
    });

    describe('Widget Visibility', () => {
        it('should be visible after show()', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            expect(widget.isVisible()).toBe(true);
        });

        it('should not be visible after hide()', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();
            widget.hide();

            expect(widget.isVisible()).toBe(false);
        });

        it('should remove DOM elements on hide()', () => {
            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();
            expect(parentElement.querySelector('.spark-inline-chat-widget')).not.toBeNull();

            widget.hide();
            expect(parentElement.querySelector('.spark-inline-chat-widget')).toBeNull();
        });
    });

    describe('Focus Management', () => {
        it('should focus mention input on show', (done) => {
            const focusSpy = jest.spyOn(HTMLDivElement.prototype, 'focus');

            const widget = new InlineChatWidget(mockApp, {
                mentionDecorator: mockMentionDecorator,
                agentName: 'alice',
                onSend: jest.fn(),
                onCancel: jest.fn(),
                top: 100,
                left: 50,
                parentElement,
            });

            widget.show();

            // Focus happens in setTimeout
            setTimeout(() => {
                // In jsdom, contenteditable focus doesn't fully work, so we just verify focus() was called
                expect(focusSpy).toHaveBeenCalled();
                focusSpy.mockRestore();
                done();
            }, 100);
        });
    });
});

