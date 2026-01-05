import { type App, Component, MarkdownRenderer } from 'obsidian';
import {
	DEFAULT_CHAT_BOTTOM,
	DEFAULT_CHAT_HEIGHT,
	DEFAULT_CHAT_RIGHT,
	DEFAULT_CHAT_WIDTH,
	MENTION_REGEX,
} from '../constants';
import type SparkPlugin from '../main';
import type { MentionDecorator } from '../mention/MentionDecorator';
import { MentionInput } from '../mention/MentionInput';
import { ResourceService } from '../services/ResourceService';
import { setCssProps } from '../utils/setCssProps';
import { ChatQueue } from './ChatQueue';
import { type ChatResult, ChatResultWatcher } from './ChatResultWatcher';
import { ChatSelector } from './ChatSelector';
import type { ConversationStorage } from './ConversationStorage';
import type { ChatMessage, ChatState } from './types';

export class ChatWindow extends Component {
	private app: App;
	private plugin: SparkPlugin;
	private containerEl: HTMLElement;
	private messagesEl: HTMLElement;
	private inputEl: HTMLDivElement | null = null;
	private titleEl: HTMLElement;
	private messageByElement = new WeakMap<Element, ChatMessage>();
	private conversationStorage: ConversationStorage;
	private resourceService: ResourceService;
	private mentionDecorator: MentionDecorator;
	private mentionInput: MentionInput | null = null;
	private chatSelector: ChatSelector;
	private chatQueue: ChatQueue;
	private resultWatcher: ChatResultWatcher;
	private resizeHandles: Map<string, HTMLElement> = new Map();
	private isResizing = false;
	private resizeStartX = 0;
	private resizeStartY = 0;
	private resizeStartWidth = 0;
	private resizeStartHeight = 0;
	private resizeStartRight = 0;
	private resizeStartBottom = 0;
	private currentResizeCorner: string | null = null;
	private state: ChatState = {
		isVisible: false,
		conversationId: null,
		messages: [],
		isProcessing: false,
		mentionedAgents: new Set(),
		lastMentionedAgent: null,
		conversationName: null, // Auto-generated name from daemon
	};

	constructor(app: App, plugin: SparkPlugin, conversationStorage: ConversationStorage) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.conversationStorage = conversationStorage;
		this.resourceService = ResourceService.getInstance(app);
		this.mentionDecorator = plugin.mentionDecorator;
		this.chatQueue = new ChatQueue(app);
		this.resultWatcher = new ChatResultWatcher(app);
		this.chatSelector = new ChatSelector(
			app,
			this.conversationStorage,
			() => this.createNewChat(),
			(conversationId: string) => this.switchToConversation(conversationId)
		);
	}

	onload() {
		this.createChatWindow();
		this.setupEventListeners();
		this.setupResultWatcher();
		this.setupSelectorCallbacks();
	}

	/**
	 * Setup callbacks for chat selector
	 */
	private setupSelectorCallbacks() {
		this.chatSelector.setOnConversationDeleted((conversationId: string) => {
			this.handleConversationDeleted(conversationId);
		});
	}

	/**
	 * Handle when a conversation is deleted
	 */
	private handleConversationDeleted(conversationId: string): void {
		// Check if the deleted conversation is the active one
		if (this.state.conversationId === conversationId) {
			// Clear messages first to prevent re-saving the deleted conversation
			this.state.messages = [];
			this.state.mentionedAgents.clear();
			this.state.conversationName = null; // Reset name
			this.state.conversationId = this.generateConversationId();
			this.messagesEl.empty();
			this.updateChatTitle();
			this.chatSelector.update(this.state.conversationId);
			this.chatSelector.invalidateCache();
		}
	}

	onunload() {
		this.resultWatcher.stop();
		this.mentionInput?.destroy();
	}

	private setupResultWatcher() {
		// Listen for results from daemon
		this.resultWatcher.onResult((result: ChatResult) => {
			this.handleDaemonResult(result);
		});

		// Start watching
		void this.resultWatcher.start();
	}

	private createChatWindow() {
		// Create main container
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'spark-chat-window';

		// Create header
		const headerEl = document.createElement('div');
		headerEl.className = 'spark-chat-header';

		// Create left side with title and dropdown
		const headerLeftEl = document.createElement('div');
		headerLeftEl.className = 'spark-chat-header-left';

		this.titleEl = document.createElement('div');
		this.titleEl.textContent = 'Spark chat';
		setCssProps(this.titleEl, { fontWeight: '600' });
		this.titleEl.className = 'spark-chat-title';

		// Add dropdown button next to title
		this.chatSelector.createTitleSide(headerLeftEl);
		headerLeftEl.appendChild(this.titleEl);

		// Create right side with controls
		const headerRightEl = document.createElement('div');
		headerRightEl.className = 'spark-chat-header-right';

		// Add new chat button
		this.chatSelector.createRightSide(headerRightEl);

		const closeBtn = document.createElement('button');
		closeBtn.textContent = '×';
		closeBtn.className = 'spark-chat-close-btn';
		closeBtn.onclick = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.hide();
		};

		headerRightEl.appendChild(closeBtn);

		headerEl.appendChild(headerLeftEl);
		headerEl.appendChild(headerRightEl);

		// Create messages container
		this.messagesEl = document.createElement('div');
		this.messagesEl.className = 'spark-chat-messages';

		// Create input container
		const inputContainerEl = document.createElement('div');
		inputContainerEl.className = 'spark-chat-input-container';

		const inputWrapperEl = document.createElement('div');
		inputWrapperEl.className = 'spark-chat-input-wrapper';

		// Create mention input with full capabilities
		this.mentionInput = new MentionInput(this.app, this.plugin.mentionDecorator, {
			placeholder: 'Type your message...',
			multiLine: true,
			enableMentionClick: true, // Enable click-to-open in main chat
			onSubmit: () => this.sendMessage(),
			onChange: () => this.adjustInputHeight(),
			paletteContainer: this.containerEl,
		});

		this.inputEl = this.mentionInput.create();
		this.inputEl.className = 'spark-chat-input';

		const sendBtn = document.createElement('button');
		sendBtn.className = 'spark-chat-send-btn';
		sendBtn.textContent = '↑';
		sendBtn.setAttribute('aria-label', 'Send message');
		sendBtn.onclick = () => this.sendMessage();

		inputWrapperEl.appendChild(this.inputEl);
		inputWrapperEl.appendChild(sendBtn);
		inputContainerEl.appendChild(inputWrapperEl);

		// Create resize handles for all 4 corners
		const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
		corners.forEach(corner => {
			const handle = document.createElement('div');
			handle.className = `spark-chat-resize-handle spark-chat-resize-${corner}`;
			handle.setAttribute('aria-label', `Resize from ${corner}`);
			handle.dataset.corner = corner;
			this.resizeHandles.set(corner, handle);
			this.containerEl.appendChild(handle);
		});

		// Assemble window
		this.containerEl.appendChild(headerEl);
		this.containerEl.appendChild(this.messagesEl);
		this.containerEl.appendChild(inputContainerEl);

		// Setup resize functionality
		this.setupResize();

		// Add to document
		document.body.appendChild(this.containerEl);
		this.register(() => {
			document.body.removeChild(this.containerEl);
		});
	}

	/**
	 * Setup resize functionality for chat window
	 */
	private setupResize() {
		const handleMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const corner = target.dataset.corner;
			if (!corner) return;

			e.preventDefault();
			this.isResizing = true;
			this.currentResizeCorner = corner;
			this.resizeStartX = e.clientX;
			this.resizeStartY = e.clientY;
			this.resizeStartWidth = this.containerEl.offsetWidth;
			this.resizeStartHeight = this.containerEl.offsetHeight;

			// Get current position and convert to right/bottom positioning
			const rect = this.containerEl.getBoundingClientRect();
			this.resizeStartRight = window.innerWidth - rect.right;
			this.resizeStartBottom = window.innerHeight - rect.bottom;

			// Force right/bottom positioning (in case window was dragged using left/top)
			setCssProps(this.containerEl, {
				right: `${this.resizeStartRight}px`,
				bottom: `${this.resizeStartBottom}px`,
				left: 'auto',
				top: 'auto',
			});

			// Add resizing class for visual feedback
			this.containerEl.classList.add('spark-chat-resizing');
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (!this.isResizing || !this.currentResizeCorner) return;

			const deltaX = e.clientX - this.resizeStartX;
			const deltaY = e.clientY - this.resizeStartY;
			const resize = this.computeResizeFromCorner(this.currentResizeCorner, deltaX, deltaY);
			this.applyResize(resize);
		};

		const handleMouseUp = async () => {
			if (!this.isResizing) return;

			this.isResizing = false;
			this.currentResizeCorner = null;
			this.containerEl.classList.remove('spark-chat-resizing');

			// Save dimensions to settings (position is not saved, always defaults to bottom-right)
			const width = this.containerEl.offsetWidth;
			const height = this.containerEl.offsetHeight;

			this.plugin.settings.chatWindowWidth = width;
			this.plugin.settings.chatWindowHeight = height;
			await this.plugin.saveSettings();
		};

		// Attach mousedown to all resize handles
		this.resizeHandles.forEach(handle => {
			handle.addEventListener('mousedown', handleMouseDown);
		});

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		// Cleanup listeners on unload
		this.register(() => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		});
	}

	private computeResizeFromCorner(
		corner: string,
		deltaX: number,
		deltaY: number
	): { width: number; height: number; right: number; bottom: number } {
		switch (corner) {
			case 'bottom-right':
				return this.computeBottomRightResize(deltaX, deltaY);
			case 'bottom-left':
				return this.computeBottomLeftResize(deltaX, deltaY);
			case 'top-right':
				return this.computeTopRightResize(deltaX, deltaY);
			case 'top-left':
				return this.computeTopLeftResize(deltaX, deltaY);
			default:
				return {
					width: this.resizeStartWidth,
					height: this.resizeStartHeight,
					right: this.resizeStartRight,
					bottom: this.resizeStartBottom,
				};
		}
	}

	private computeBottomEdgeResize(deltaY: number): { height: number; bottom: number } {
		const minHeight = 300;
		const desiredHeight = Math.max(minHeight, this.resizeStartHeight + deltaY);
		const desiredHeightChange = desiredHeight - this.resizeStartHeight;
		const desiredBottom = this.resizeStartBottom - desiredHeightChange;

		if (desiredBottom <= 0) {
			return {
				height: this.resizeStartHeight + this.resizeStartBottom,
				bottom: 0,
			};
		}

		return {
			height: desiredHeight,
			bottom: desiredBottom,
		};
	}

	private computeTopEdgeHeight(deltaY: number): number {
		const minHeight = 300;
		const desiredHeight = Math.max(minHeight, this.resizeStartHeight - deltaY);
		const desiredTopPosition = window.innerHeight - this.resizeStartBottom - desiredHeight;
		if (desiredTopPosition <= 0) {
			return window.innerHeight - this.resizeStartBottom;
		}
		return desiredHeight;
	}

	private computeBottomRightResize(
		deltaX: number,
		deltaY: number
	): { width: number; height: number; right: number; bottom: number } {
		const minWidth = 300;
		const width = Math.max(minWidth, this.resizeStartWidth + deltaX);
		const { height, bottom } = this.computeBottomEdgeResize(deltaY);
		const widthChange = width - this.resizeStartWidth;
		const right = Math.max(0, this.resizeStartRight - widthChange);

		return { width, height, right, bottom };
	}

	private computeBottomLeftResize(
		deltaX: number,
		deltaY: number
	): { width: number; height: number; right: number; bottom: number } {
		const minWidth = 300;
		const width = Math.max(minWidth, this.resizeStartWidth - deltaX);
		const { height, bottom } = this.computeBottomEdgeResize(deltaY);

		return { width, height, right: this.resizeStartRight, bottom };
	}

	private computeTopRightResize(
		deltaX: number,
		deltaY: number
	): { width: number; height: number; right: number; bottom: number } {
		const minWidth = 300;
		const width = Math.max(minWidth, this.resizeStartWidth + deltaX);
		const height = this.computeTopEdgeHeight(deltaY);
		const widthChange = width - this.resizeStartWidth;
		const right = Math.max(0, this.resizeStartRight - widthChange);

		return { width, height, right, bottom: this.resizeStartBottom };
	}

	private computeTopLeftResize(
		deltaX: number,
		deltaY: number
	): { width: number; height: number; right: number; bottom: number } {
		const minWidth = 300;
		const width = Math.max(minWidth, this.resizeStartWidth - deltaX);
		const height = this.computeTopEdgeHeight(deltaY);

		return { width, height, right: this.resizeStartRight, bottom: this.resizeStartBottom };
	}

	private applyResize(resize: {
		width: number;
		height: number;
		right: number;
		bottom: number;
	}): void {
		setCssProps(this.containerEl, {
			width: `${resize.width}px`,
			height: `${resize.height}px`,
			right: `${resize.right}px`,
			bottom: `${resize.bottom}px`,
		});
	}

	private setupEventListeners() {
		// MentionInput already handles all input events
		// Just make window draggable
		this.makeDraggable();
	}

	private makeDraggable() {
		const headerEl = this.containerEl.querySelector('.spark-chat-header') as HTMLElement;
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		let initialLeft = 0;
		let initialTop = 0;

		headerEl.addEventListener('mousedown', e => {
			if (e.target === headerEl || headerEl.contains(e.target as Node)) {
				isDragging = true;
				startX = e.clientX;
				startY = e.clientY;
				initialLeft = this.containerEl.offsetLeft;
				initialTop = this.containerEl.offsetTop;
				setCssProps(headerEl, { cursor: 'grabbing' });
			}
		});

		// Doubleclick to reset to default position and size
		headerEl.addEventListener('dblclick', () => {
			// Reset to default position (bottom-right corner)
			setCssProps(this.containerEl, {
				left: 'auto',
				top: 'auto',
				right: `${DEFAULT_CHAT_RIGHT}px`,
				bottom: `${DEFAULT_CHAT_BOTTOM}px`,
			});

			// Reset to default size
			setCssProps(this.containerEl, {
				width: `${DEFAULT_CHAT_WIDTH}px`,
				height: `${DEFAULT_CHAT_HEIGHT}px`,
			});

			// Save defaults to settings
			this.plugin.settings.chatWindowWidth = DEFAULT_CHAT_WIDTH;
			this.plugin.settings.chatWindowHeight = DEFAULT_CHAT_HEIGHT;
			this.plugin.settings.chatWindowRight = 20;
			this.plugin.settings.chatWindowBottom = 20;
			void this.plugin.saveSettings();
		});

		document.addEventListener('mousemove', e => {
			if (isDragging) {
				const deltaX = e.clientX - startX;
				const deltaY = e.clientY - startY;
				let newLeft = initialLeft + deltaX;
				let newTop = initialTop + deltaY;

				// Apply boundary constraints to keep window accessible
				const windowWidth = this.containerEl.offsetWidth;
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;
				const minVisibleWidth = 100; // Minimum pixels visible on horizontal edges
				const minVisibleTop = 50; // Minimum pixels visible at top (header height)

				// Constrain horizontal position (keep at least minVisibleWidth on screen)
				const maxLeft = viewportWidth - minVisibleWidth;
				const minLeft = -(windowWidth - minVisibleWidth);
				newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));

				// Constrain vertical position (keep header visible)
				const maxTop = viewportHeight - minVisibleTop;
				newTop = Math.max(0, Math.min(newTop, maxTop));

				setCssProps(this.containerEl, {
					left: `${newLeft}px`,
					top: `${newTop}px`,
					right: 'auto',
					bottom: 'auto',
				});
			}
		});

		document.addEventListener('mouseup', () => {
			if (isDragging) {
				isDragging = false;
				setCssProps(headerEl, { cursor: 'move' });

				// Save position to settings
				// Window is positioned using left/top after dragging, convert to right/bottom
				const rect = this.containerEl.getBoundingClientRect();
				const right = window.innerWidth - rect.right;
				const bottom = window.innerHeight - rect.bottom;

				this.plugin.settings.chatWindowRight = right;
				this.plugin.settings.chatWindowBottom = bottom;
				void this.plugin.saveSettings();
			}
		});
	}

	show() {
		// Apply saved dimensions and position
		const width = this.plugin.settings.chatWindowWidth || DEFAULT_CHAT_WIDTH;
		const height = this.plugin.settings.chatWindowHeight || DEFAULT_CHAT_HEIGHT;
		const right = this.plugin.settings.chatWindowRight ?? 20;
		const bottom = this.plugin.settings.chatWindowBottom ?? 20;

		setCssProps(this.containerEl, {
			width: `${width}px`,
			height: `${height}px`,
			right: `${right}px`,
			bottom: `${bottom}px`,
			display: 'flex',
		});
		this.state.isVisible = true;
		// Position cursor at end (important for inputs with mentions/styled content)
		this.mentionInput?.focusEnd();
		// Initialize conversation if needed
		void this.initializeConversation();
		// Preload conversations for instant dropdown response
		void this.chatSelector.loadConversations();
	}

	hide() {
		setCssProps(this.containerEl, { display: 'none' });
		this.state.isVisible = false;
	}

	toggle() {
		if (this.state.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	/**
	 * Add agent mention to chat - either opens new chat or appends to existing
	 */
	addAgentMention(agentName: string): void {
		if (this.state.isVisible) {
			// Chat is open - append mention to existing input
			this.insertAgentMention(agentName);
		} else {
			// Chat is closed - open new chat with agent
			this.openWithAgent(agentName);
		}
	}

	/**
	 * Insert agent mention into current chat input
	 */
	private insertAgentMention(agentName: string): void {
		if (!this.mentionInput) return;

		// Get current content and trim trailing spaces
		const currentText = this.mentionInput.getText().trimEnd();

		// Add space before mention if content exists (use non-breaking space to preserve in HTML)
		const prefix = currentText.length > 0 ? '\u00A0' : '';

		// Build new content with mention and trailing non-breaking space (so it's preserved in HTML)
		const newContent = `${currentText}${prefix}@${agentName}\u00A0`;
		this.mentionInput.setText(newContent);

		// Focus at end with cursor positioned after the mention
		this.mentionInput.focusEnd();
	}

	/**
	 * Open new chat with agent mention
	 */
	private openWithAgent(agentName: string): void {
		// Show window first (but don't initialize conversation yet)
		setCssProps(this.containerEl, { display: 'flex' });
		this.state.isVisible = true;

		// Create NEW conversation (clears everything)
		this.createNewChat();

		// Pre-fill input with agent mention and trailing non-breaking space (so it's preserved in HTML)
		const mention = `@${agentName}\u00A0`;
		this.mentionInput?.setText(mention);

		// Focus at end with cursor positioned after the mention
		this.mentionInput?.focusEnd();

		// Update state
		this.state.lastMentionedAgent = agentName;
		this.state.mentionedAgents.add(agentName);

		// Update title
		this.updateChatTitle([agentName]);
	}

	private async initializeConversation() {
		// Try to find most recent conversation
		const recentConversation = await this.findMostRecentConversation();
		if (recentConversation) {
			this.state.conversationId = recentConversation;
		} else {
			this.state.conversationId = this.generateConversationId();
		}

		// Load the conversation (whether it's existing or new)
		await this.loadConversation();
	}

	private generateConversationId(): string {
		return `chat-${Date.now()}`;
	}

	private async findMostRecentConversation(): Promise<string | null> {
		try {
			// Use ConversationStorage to find most recent conversation
			const recentConversation = await this.conversationStorage.getMostRecentConversation();
			return recentConversation;
		} catch (error) {
			console.error('Spark Chat: Error finding recent conversation:', error);
			return null;
		}
	}

	private async loadConversation() {
		if (!this.state.conversationId) {
			return;
		}

		// Clear current messages
		this.messagesEl.empty();
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.lastMentionedAgent = null;

		// Try to load existing conversation using ConversationStorage
		try {
			const conversation = await this.conversationStorage.loadConversation(
				this.state.conversationId
			);
			if (conversation) {
				this.state.messages = conversation.messages || [];
				this.state.mentionedAgents = new Set(conversation.mentionedAgents || []);
				this.state.conversationName = conversation.name || null;

				// Restore lastMentionedAgent from mentionedAgents set
				// Use the last agent in the set (most recently added)
				const agentsArray = Array.from(this.state.mentionedAgents);
				if (agentsArray.length > 0) {
					this.state.lastMentionedAgent = agentsArray[agentsArray.length - 1];
				}

				this.renderAllMessages();
				this.updateChatTitle(Array.from(this.state.mentionedAgents));
			}
		} catch (error) {
			console.error('Spark Chat: Failed to load conversation:', error);
		}
	}

	private async saveConversation() {
		if (!this.state.conversationId) return;

		// Check if conversation is empty (no real messages, only loading messages)
		const hasRealMessages = this.state.messages.some(msg => msg.type !== 'loading');

		if (!hasRealMessages) {
			// Delete the empty conversation
			try {
				await this.conversationStorage.deleteConversation(this.state.conversationId);
				this.chatSelector.invalidateCache();
			} catch (error) {
				console.error('Spark Chat: Failed to delete empty conversation:', error);
			}
			return;
		}

		// Load existing conversation to get created timestamp, but use current state for everything else
		const existing = await this.conversationStorage.loadConversation(this.state.conversationId);

		const conversationData = {
			id: this.state.conversationId,
			created: existing?.created || new Date().toISOString(),
			updated: new Date().toISOString(),
			messages: this.state.messages,
			mentionedAgents: Array.from(this.state.mentionedAgents),
			name: this.state.conversationName || undefined, // Use current state, not preserved from storage
		};

		try {
			await this.conversationStorage.saveConversation(conversationData);
			// Invalidate cache so dropdown shows updated list
			this.chatSelector.invalidateCache();
		} catch (error) {
			console.error('Spark Chat: Failed to save conversation:', error);
		}
	}

	private renderAllMessages() {
		this.messagesEl.empty();
		this.state.messages.forEach(message => {
			this.renderMessage(message);
		});
		this.scrollToBottom();
	}

	private sendMessage() {
		const content = this.getInputText().trim();
		if (!content) return;

		const message: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date().toISOString(),
			type: 'user',
			content,
		};

		this.addMessage(message);
		this.clearInput();

		// Process message through command executor
		void this.processMessage(message);
	}

	private getInputText(): string {
		return this.mentionInput?.getText() || '';
	}

	private clearInput(): void {
		this.mentionInput?.clear();
		this.adjustInputHeight();
	}

	private adjustInputHeight(): void {
		if (!this.inputEl) return;

		// Reset height to auto to recalculate
		setCssProps(this.inputEl, { height: 'auto' });

		// Use min-height of 56px (2 lines) for empty or small content
		const minHeight = 56;
		const scrollHeight = Math.max(this.inputEl.scrollHeight, minHeight);

		// Limit height to 120px (like textarea behavior)
		if (scrollHeight > 120) {
			setCssProps(this.inputEl, { height: '120px', maxHeight: '120px', overflowY: 'auto' });
		} else {
			setCssProps(this.inputEl, {
				height: `${scrollHeight}px`,
				maxHeight: 'none',
				overflowY: 'hidden',
			});
		}
	}

	addMessage(message: ChatMessage) {
		this.state.messages.push(message);
		this.renderMessage(message);
		this.scrollToBottom();
		// Save conversation after adding message
		void this.saveConversation();
	}

	private renderMessage(message: ChatMessage) {
		const messageEl = document.createElement('div');
		messageEl.className = `spark-chat-message spark-chat-${message.type}`;

		// Add agent name if present
		if (message.agent) {
			const agentEl = document.createElement('div');
			agentEl.className = 'spark-chat-agent-name';
			agentEl.textContent = message.agent;
			messageEl.appendChild(agentEl);
		}

		// Add message content
		const contentEl = document.createElement('div');
		contentEl.className = 'spark-chat-message-content';

		if (message.type === 'loading') {
			// Create jumping dots loader using DOM APIs
			const loadingTextSpan = contentEl.createSpan({ cls: 'spark-chat-loading-dots' });
			loadingTextSpan.textContent = message.content;
			contentEl.createSpan({ cls: 'spark-jumping-dots' });
		} else if (message.type === 'agent') {
			// Render agent responses as markdown
			void this.renderMarkdown(message.content, contentEl);
			// Note: Global listener in main.ts handles clicks
		} else {
			// User messages with mention decoration
			contentEl.textContent = message.content;
			this.mentionDecorator.decorateMentionsInElement(contentEl);
			// Note: Global listener in main.ts handles clicks
		}

		messageEl.appendChild(contentEl);

		// Store message reference for removal
		this.messageByElement.set(messageEl, message);

		this.messagesEl.appendChild(messageEl);
	}

	private async extractAgentNames(content: string): Promise<string[]> {
		const agentNames: string[] = [];
		// Match @mentions including hyphens and folder slashes (same pattern as decorateMentions)
		const mentionMatches = content.match(MENTION_REGEX) || [];

		for (const match of mentionMatches) {
			const name = match.substring(1); // Remove @

			// Check if it's a folder (ends with /)
			const isFolder = name.endsWith('/');
			if (isFolder) {
				continue; // Skip folders
			}

			// Check if it's a valid agent using ResourceService
			const isAgent = await this.resourceService.validateAgent(name);

			// Only add to chat title if it's an actual agent
			if (isAgent) {
				agentNames.push(name);
			}
		}

		return agentNames;
	}

	private async renderMarkdown(content: string, containerEl: HTMLElement): Promise<void> {
		// Clear container
		containerEl.empty();
		// Use Obsidian's native markdown renderer
		await MarkdownRenderer.render(this.app, content, containerEl, '', this);
		// After rendering, decorate mentions in the HTML (preserving HTML structure)
		this.mentionDecorator.decorateMentionsInElement(containerEl);
	}

	private scrollToBottom() {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2);
	}

	private removeMessage(messageId: string) {
		// Remove from state
		this.state.messages = this.state.messages.filter(msg => msg.id !== messageId);

		// Remove from DOM
		const messageElements = this.messagesEl.querySelectorAll('.spark-chat-message');
		messageElements.forEach(el => {
			const message = this.messageByElement.get(el);
			if (message && message.id === messageId) {
				this.messagesEl.removeChild(el);
			}
		});
	}

	// Chat selector methods
	createNewChat(): void {
		// Save current conversation if it has messages
		if (this.state.messages.length > 0) {
			void this.saveConversation();
		}

		// Reset state for new conversation
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.conversationId = this.generateConversationId();
		this.state.conversationName = null; // Clear name for new chat
		this.messagesEl.empty();
		this.updateChatTitle();
		this.chatSelector.update(this.state.conversationId);

		// Save the new empty conversation
		void this.saveConversation();

		// Invalidate cache so next dropdown shows updated list
		this.chatSelector.invalidateCache();
	}

	async switchToConversation(conversationId: string): Promise<void> {
		// Save current conversation if it has messages and is different
		if (this.state.messages.length > 0 && this.state.conversationId !== conversationId) {
			await this.saveConversation();
		}

		// Load the selected conversation
		this.state.conversationId = conversationId;
		await this.loadConversation();
		this.chatSelector.update(conversationId);

		// Invalidate cache so next dropdown shows updated list
		this.chatSelector.invalidateCache();
	}

	// Public methods for ChatManager access
	getMessages(): ChatMessage[] {
		return [...this.state.messages]; // Return copy
	}

	getConversationId(): string | null {
		return this.state.conversationId;
	}

	isProcessing(): boolean {
		return this.state.isProcessing;
	}

	clearConversation() {
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.lastMentionedAgent = null;
		this.state.conversationId = this.generateConversationId();
		this.messagesEl.empty();
		this.updateChatTitle();
		this.chatSelector.update(this.state.conversationId);
		// Save the cleared conversation state
		void this.saveConversation();
	}

	/**
	 * Refresh the currently open chat (reload and sync with storage)
	 * Used when agent names are updated in settings
	 *
	 * Note: We reload from storage to get the updated agent names.
	 */
	async refreshCurrentChat(): Promise<void> {
		// Refresh agent cache for latest agents
		this.resourceService.invalidateAgentCache();
		await this.resourceService.loadAgents();

		// Refresh mention input to pick up new agents
		await this.mentionInput?.refresh();

		// If chat is visible and has a conversation, reload and re-render it
		if (this.state.isVisible && this.state.conversationId) {
			// Load the updated conversation from storage
			// This will have the updated agent names from updateAgentName
			const conversation = await this.conversationStorage.loadConversation(
				this.state.conversationId
			);
			if (conversation) {
				// Update in-memory state with the updated messages (agent names, mentions)
				this.state.messages = conversation.messages || [];
				this.state.mentionedAgents = new Set(conversation.mentionedAgents || []);

				// Update lastMentionedAgent from mentionedAgents set
				const agentsArray = Array.from(this.state.mentionedAgents);
				if (agentsArray.length > 0) {
					this.state.lastMentionedAgent = agentsArray[agentsArray.length - 1];
				}

				// Re-render all messages with updated names
				this.renderAllMessages();

				// Update chat title with current mentioned agents
				this.updateChatTitle(Array.from(this.state.mentionedAgents));
			}
		}

		// Invalidate cache so dropdown shows updated conversation titles
		this.chatSelector.invalidateCache();
	}

	/**
	 * Update conversation name from daemon result
	 */
	private async updateConversationName(name: string): Promise<void> {
		if (!this.state.conversationId) return;

		try {
			// Update in-memory state
			this.state.conversationName = name;

			// Update chat title display
			this.titleEl.textContent = name;

			// Save the conversation (persists current messages + new name)
			await this.saveConversation();
		} catch (error) {
			console.error('Failed to update conversation name:', error);
		}
	}

	private updateChatTitle(agentNames?: string[]) {
		// Priority 1: Use in-memory conversation name if available (avoids async race conditions)
		if (this.state.conversationName) {
			this.titleEl.textContent = this.state.conversationName;
			return;
		}

		// Priority 2: Use agent-based title
		this.setAgentBasedTitle(agentNames);
	}

	private setAgentBasedTitle(agentNames?: string[]): void {
		if (!agentNames || agentNames.length === 0) {
			this.titleEl.textContent = 'Spark chat';
			return;
		}

		// Filter out "Spark Assistant" and get unique real agents
		const realAgents = [...new Set(agentNames.filter(name => name !== 'Spark Assistant'))];

		if (realAgents.length === 0) {
			// No real agents, show default title
			this.titleEl.textContent = 'Spark chat';
		} else if (realAgents.length === 1) {
			this.titleEl.textContent = `Chat with ${realAgents[0]}`;
		} else if (realAgents.length === 2) {
			this.titleEl.textContent = `Chat with ${realAgents[0]} and ${realAgents[1]}`;
		} else if (realAgents.length === 3) {
			this.titleEl.textContent = `Chat with ${realAgents[0]}, ${realAgents[1]} and ${realAgents[2]}`;
		} else {
			this.titleEl.textContent = `Chat with ${realAgents[0]}, ${realAgents[1]} and ${realAgents.length - 2} others`;
		}
	}

	private async processMessage(message: ChatMessage) {
		// Extract agent names (not files) from message
		const agentNames = await this.extractAgentNames(message.content);

		// Check if this is the first message with no agents in the conversation
		const hasAgentsInConversation = this.state.mentionedAgents.size > 0;
		const hasAgentsInMessage = agentNames.length > 0;

		// If no agents mentioned at all and no agents in conversation, show suggestion
		if (!hasAgentsInConversation && !hasAgentsInMessage) {
			// Show suggestion to mention an agent
			const suggestionMessage: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date().toISOString(),
				type: 'agent',
				content:
					'💡 Tip: Mention an agent using @agent_name to get better responses. For example: @betty help me with this task.',
				agent: 'Spark Assistant',
			};
			this.addMessage(suggestionMessage);
			return; // Don't process the message further
		}

		// Track mentioned agents in state (only real agents, not files)
		agentNames.forEach(agentName => {
			this.state.mentionedAgents.add(agentName);
			// Update last mentioned agent (most recent one)
			this.state.lastMentionedAgent = agentName;
		});

		// Update chat title (excluding Spark Assistant if real agents are mentioned)
		this.updateChatTitle(Array.from(this.state.mentionedAgents));

		// Show loading message with agent name
		const agentName = this.state.lastMentionedAgent || 'Agent';
		const capitalizedAgentName = agentName.charAt(0).toUpperCase() + agentName.slice(1);
		const loadingMessage: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date().toISOString(),
			type: 'loading',
			content: `${capitalizedAgentName} is typing`,
		};
		this.addMessage(loadingMessage);
		this.state.isProcessing = true;

		try {
			// Build conversation history for context (exclude current message)
			const history = this.state.messages
				.filter(msg => msg.type !== 'loading' && msg.id !== message.id)
				.slice(-10) // Last 10 messages for context
				.map(msg => ({
					role: msg.type === 'user' ? 'user' : 'assistant',
					content: msg.content,
				}));

			// Enqueue message for daemon processing
			if (this.state.conversationId) {
				// Get currently active file for vault context
				const activeFile = this.app.workspace.getActiveFile();
				const activeFilePath = activeFile?.path;

				await this.chatQueue.enqueue(
					this.state.conversationId,
					message.content,
					history,
					activeFilePath,
					this.state.lastMentionedAgent || undefined
				);
			}
		} catch (error) {
			console.error('ChatWindow: Failed to enqueue message:', error);
			// Remove loading message and show error
			this.removeMessage(loadingMessage.id);
			const errorMessage: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date().toISOString(),
				type: 'agent',
				content: '❌ Failed to send message. Please try again.',
				agent: 'Spark Assistant',
			};
			this.addMessage(errorMessage);
			this.state.isProcessing = false;
		}
	}

	/**
	 * Handle result from daemon
	 */
	private handleDaemonResult(result: ChatResult): void {
		const isFinalResult = Boolean(result.content || result.error);
		const isActiveConversation = result.conversationId === this.state.conversationId;

		if (isActiveConversation) {
			this.handleActiveConversationResult(result, isFinalResult);
		} else {
			void this.updateBackgroundConversation(result);
		}

		// Clean up queue file only if it's a final result (has content or error)
		// Intermediate results (like name updates) should not remove the queue file
		// as the daemon is still processing the main response
		if (isFinalResult) {
			void this.chatQueue.dequeue(result.queueId);
		}
	}

	private handleActiveConversationResult(result: ChatResult, isFinalResult: boolean): void {
		if (isFinalResult) {
			this.removeLoadingMessages();
		}

		if (result.error) {
			this.addDaemonErrorMessage(result);
		} else if (result.content) {
			this.addDaemonResponseMessage(result);
			this.addFilesModifiedNotification(result);
		}

		this.state.isProcessing = false;

		if (result.conversationName) {
			void this.updateConversationName(result.conversationName);
		}
	}

	private removeLoadingMessages(): void {
		const loadingMessages = this.state.messages.filter(msg => msg.type === 'loading');
		loadingMessages.forEach(msg => {
			this.removeMessage(msg.id);
		});
	}

	private addDaemonErrorMessage(result: ChatResult): void {
		const errorMessage: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date(result.timestamp).toISOString(),
			type: 'agent',
			content: `❌ Error: ${result.error}`,
			agent: result.agent || 'Spark Assistant',
		};
		this.addMessage(errorMessage);
	}

	private addDaemonResponseMessage(result: ChatResult): void {
		const response: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date(result.timestamp).toISOString(),
			type: 'agent',
			content: result.content,
			agent: result.agent,
			filesModified: result.filesModified,
		};
		this.addMessage(response);
	}

	private addFilesModifiedNotification(result: ChatResult): void {
		if (!result.filesModified || result.filesModified.length === 0) return;

		const notificationMessage: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date(result.timestamp).toISOString(),
			type: 'agent',
			content: `📝 Modified ${result.filesModified.length} file(s):\n${result.filesModified.map(f => `  • ${f}`).join('\n')}`,
			agent: 'Spark Assistant',
		};
		this.addMessage(notificationMessage);
	}

	/**
	 * Update a conversation that's not currently active
	 */
	private async updateBackgroundConversation(result: ChatResult): Promise<void> {
		try {
			// Load the conversation from storage
			const conversation = await this.conversationStorage.loadConversation(result.conversationId);
			if (!conversation) {
				console.warn(
					'ChatWindow: Conversation not found for background update:',
					result.conversationId
				);
				return;
			}

			// Remove loading messages
			conversation.messages = conversation.messages.filter(msg => msg.type !== 'loading');

			// Add response
			if (result.error) {
				conversation.messages.push({
					id: this.generateId(),
					timestamp: new Date(result.timestamp).toISOString(),
					type: 'agent',
					content: `❌ Error: ${result.error}`,
					agent: result.agent || 'Spark Assistant',
				});
			} else {
				conversation.messages.push({
					id: this.generateId(),
					timestamp: new Date(result.timestamp).toISOString(),
					type: 'agent',
					content: result.content,
					agent: result.agent,
					filesModified: result.filesModified,
				});

				// Add file modification notification
				if (result.filesModified && result.filesModified.length > 0) {
					conversation.messages.push({
						id: this.generateId(),
						timestamp: new Date(result.timestamp).toISOString(),
						type: 'agent',
						content: `📝 Modified ${result.filesModified.length} file(s):\n${result.filesModified.map(f => `  • ${f}`).join('\n')}`,
						agent: 'Spark Assistant',
					});
				}
			}

			// Update conversation name if provided by daemon
			if (result.conversationName) {
				conversation.name = result.conversationName;
			}

			// Save updated conversation
			conversation.updated = new Date().toISOString();
			await this.conversationStorage.saveConversation(conversation);
			this.chatSelector.invalidateCache();
		} catch (error) {
			console.error('ChatWindow: Failed to update background conversation:', error);
		}
	}
}
