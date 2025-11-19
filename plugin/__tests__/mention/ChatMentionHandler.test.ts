
import { ChatMentionHandler } from '../../src/mention/ChatMentionHandler';
import { MentionDecorator } from '../../src/mention/MentionDecorator';
import { App } from 'obsidian';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

describe('ChatMentionHandler', () => {
    let handler: ChatMentionHandler;
    let mockApp: App;
    let mockDecorator: MentionDecorator;
    let mockInput: HTMLDivElement;
    let mockPlugin: any;

    beforeEach(() => {
        mockApp = {} as App;
        mockDecorator = {
            handleMentionClick: jest.fn(),
        } as unknown as MentionDecorator;
        mockPlugin = {
            chatManager: {
                openChatWithAgent: jest.fn(),
            },
        };

        handler = new ChatMentionHandler(mockApp, mockDecorator, mockPlugin);
        mockInput = document.createElement('div');
        handler.attachToInput(mockInput);
    });

    test('should NOT delegate agent mention clicks if agent is in current chat', () => {
        // Mock that agent is in current chat
        mockPlugin.chatManager.chatWindow = {
            state: {
                mentionedAgents: new Set(['Agent']),
            },
        };

        // Create an agent token
        const token = document.createElement('span');
        token.className = 'spark-token spark-token-agent';
        token.setAttribute('data-type', 'agent');
        token.setAttribute('data-token', '@Agent');
        mockInput.appendChild(token);

        // Simulate click
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(event, 'target', { value: token });

        mockInput.dispatchEvent(event);

        // Should NOT call decorator
        expect(mockDecorator.handleMentionClick).not.toHaveBeenCalled();
        // Should NOT open new chat
        expect(mockPlugin.chatManager.openChatWithAgent).not.toHaveBeenCalled();
    });

    test('should do nothing if agent is clicked (even if not in current chat)', () => {
        // Mock that agent is NOT in current chat
        mockPlugin.chatManager.chatWindow = {
            state: {
                mentionedAgents: new Set(['OtherAgent']),
            },
        };

        // Create an agent token
        const token = document.createElement('span');
        token.className = 'spark-token spark-token-agent';
        token.setAttribute('data-type', 'agent');
        token.setAttribute('data-token', '@Agent');
        mockInput.appendChild(token);

        // Simulate click
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(event, 'target', { value: token });

        // Spy on stopPropagation
        const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');

        mockInput.dispatchEvent(event);

        // Should stop propagation
        expect(stopPropagationSpy).toHaveBeenCalled();
        // Should NOT call decorator
        expect(mockDecorator.handleMentionClick).not.toHaveBeenCalled();
        // Should NOT open new chat (simplified behavior)
        expect(mockPlugin.chatManager.openChatWithAgent).not.toHaveBeenCalled();
    });

    test('should handle clicks on nested elements within token', () => {
        // Mock that agent is in current chat
        mockPlugin.chatManager.chatWindow = {
            state: {
                mentionedAgents: new Set(['Agent']),
            },
        };

        // Create an agent token with nested element
        const token = document.createElement('span');
        token.className = 'spark-token spark-token-agent';
        token.setAttribute('data-type', 'agent');
        token.setAttribute('data-token', '@Agent');

        const innerSpan = document.createElement('span');
        innerSpan.textContent = '@Agent';
        token.appendChild(innerSpan);

        mockInput.appendChild(token);

        // Simulate click on inner element
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(event, 'target', { value: innerSpan });

        mockInput.dispatchEvent(event);

        // Should correctly identify parent token and NOT call decorator
        expect(mockDecorator.handleMentionClick).not.toHaveBeenCalled();
    });

    test('should delegate file mention clicks to decorator', () => {
        // Create a file token
        const token = document.createElement('span');
        token.className = 'spark-token spark-token-file';
        token.setAttribute('data-type', 'file');
        token.setAttribute('data-token', '@Note');
        mockInput.appendChild(token);

        // Simulate click
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(event, 'target', { value: token });

        mockInput.dispatchEvent(event);

        // Should call decorator
        expect(mockDecorator.handleMentionClick).toHaveBeenCalled();
    });
});
