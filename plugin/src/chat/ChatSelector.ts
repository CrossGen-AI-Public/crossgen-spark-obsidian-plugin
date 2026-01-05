import { type App, SuggestModal, setIcon } from 'obsidian';
import { setCssProps } from '../utils/setCssProps';
import type { ConversationStorage } from './ConversationStorage';
import type { ChatConversation } from './types';

/**
 * Modal for selecting conversations
 */
class ConversationSelectModal extends SuggestModal<ChatConversation> {
	private conversations: ChatConversation[];
	private onSelect: (conversation: ChatConversation | null) => void;
	private storage: ConversationStorage;
	private selector: ChatSelector | null;

	constructor(
		app: App,
		storage: ConversationStorage,
		conversations: ChatConversation[],
		onSelect: (conversation: ChatConversation | null) => void,
		selector?: ChatSelector
	) {
		super(app);
		this.storage = storage;
		this.conversations = conversations;
		this.onSelect = onSelect;
		this.selector = selector || null;
	}

	// Returns available suggestions.
	getSuggestions(query: string): ChatConversation[] {
		// If no query, return all conversations
		if (!query || query.trim() === '') {
			return this.conversations;
		}

		// Otherwise filter by content
		return this.conversations.filter(conv =>
			conv.messages.some(msg => msg.content.toLowerCase().includes(query.toLowerCase()))
		);
	}

	// Renders each suggestion item.
	renderSuggestion(conversation: ChatConversation, el: HTMLElement) {
		const firstMessage = conversation.messages[0];
		const date = new Date(conversation.created).toLocaleDateString();

		// Create container for suggestion content
		const contentEl = el.createDiv({ cls: 'spark-conversation-suggestion-content' });

		// Title section - show generated name if available, otherwise date
		const titleEl = contentEl.createDiv({ cls: 'suggestion-title' });
		if (conversation.name) {
			// Show generated name as primary text
			titleEl.setText(conversation.name);
		} else {
			// Fallback to date if no name
			titleEl.setText(date);
		}

		// Message preview or date (secondary info)
		const noteEl = contentEl.createDiv({ cls: 'suggestion-note' });
		if (conversation.name) {
			// If we have a name, show date as secondary info
			noteEl.setText(date);
		} else if (firstMessage) {
			// Otherwise show message preview
			const preview =
				firstMessage.content.length > 50
					? `${firstMessage.content.substring(0, 50)}...`
					: firstMessage.content;
			noteEl.setText(preview);
		} else {
			noteEl.setText('Empty conversation');
			setCssProps(noteEl, { opacity: '0.5' });
		}

		// Add delete button
		const deleteBtn = contentEl.createDiv({
			cls: 'spark-conversation-delete-btn',
		});
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.title = 'Delete conversation';
		deleteBtn.onclick = (e: MouseEvent) => {
			e.stopPropagation();
			void this.deleteConversation(conversation.id, el);
		};

		el.dataset.conversationId = conversation.id;
	}

	// Delete a conversation
	private async deleteConversation(conversationId: string, element: HTMLElement): Promise<void> {
		try {
			await this.storage.deleteConversation(conversationId);
			this.conversations = this.conversations.filter(conv => conv.id !== conversationId);

			// Notify selector to update its cache
			this.selector?.onConversationDeleted(conversationId);

			// Remove from UI with animation
			setCssProps(element, { opacity: '0', transform: 'translateX(-100%)' });
			window.setTimeout(() => {
				element.remove();
				if (this.inputEl) {
					this.inputEl.dispatchEvent(new Event('input'));
				}
			}, 200);
		} catch (error) {
			console.error('Failed to delete conversation:', error);
		}
	}

	// Perform action on the selected suggestion.
	onChooseSuggestion(conversation: ChatConversation, _evt: MouseEvent | KeyboardEvent) {
		this.onSelect(conversation);
	}
}

/**
 * Chat selector component for managing conversations
 */
export class ChatSelector {
	private app: App;
	private containerEl: HTMLElement;
	private storage: ConversationStorage;
	private onNewChat: () => void;
	private onSelectConversation: (_conversationId: string) => void;
	private onConversationDeletedCallback: ((conversationId: string) => void) | null = null;
	private activeModal: ConversationSelectModal | null = null;
	private conversations: ChatConversation[] | null = null;

	constructor(
		app: App,
		storage: ConversationStorage,
		onNewChat: () => void,
		onSelectConversation: (conversationId: string) => void
	) {
		this.app = app;
		this.storage = storage;
		this.onNewChat = onNewChat;
		this.onSelectConversation = onSelectConversation;
	}

	/**
	 * Set callback for when a conversation is deleted
	 */
	setOnConversationDeleted(callback: (conversationId: string) => void): void {
		this.onConversationDeletedCallback = callback;
	}

	/**
	 * Load conversations in background
	 */
	async loadConversations(): Promise<void> {
		try {
			this.conversations = await this.storage.listConversations();
		} catch (error) {
			console.error('Failed to load conversations:', error);
			this.conversations = [];
		}
	}

	/**
	 * Invalidate cached conversations (call when creating new chat or switching)
	 */
	invalidateCache(): void {
		this.conversations = null;
	}

	/**
	 * Handle conversation deletion - update cache
	 */
	onConversationDeleted(conversationId: string): void {
		if (this.conversations) {
			this.conversations = this.conversations.filter(conv => conv.id !== conversationId);
		}
		// Notify ChatWindow if this is the active conversation
		if (this.onConversationDeletedCallback) {
			this.onConversationDeletedCallback(conversationId);
		}
	}

	/**
	 * Create the selector UI for the left side (dropdown next to title)
	 */
	createTitleSide(containerEl: HTMLElement): void {
		this.containerEl = containerEl;

		const dropdownBtn = document.createElement('button');
		dropdownBtn.className = 'spark-chat-dropdown-btn';
		dropdownBtn.textContent = '☰';
		dropdownBtn.title = 'Select Conversation';
		dropdownBtn.onclick = async () => await this.showConversationModal();

		containerEl.appendChild(dropdownBtn);
	}

	/**
	 * Create the selector UI for the right side (new chat button)
	 */
	createRightSide(containerEl: HTMLElement): void {
		const newChatBtn = document.createElement('button');
		newChatBtn.className = 'spark-chat-new-btn';
		newChatBtn.textContent = '+';
		newChatBtn.title = 'New Chat';
		newChatBtn.onclick = () => this.onNewChat();

		containerEl.appendChild(newChatBtn);
	}

	/**
	 * Create the selector UI (legacy method for backward compatibility)
	 */
	create(containerEl: HTMLElement): void {
		this.createRightSide(containerEl);
	}

	/**
	 * Show conversation selection modal
	 */
	private async showConversationModal(): Promise<void> {
		if (this.activeModal) {
			this.activeModal.close();
			this.activeModal = null;
			return;
		}

		// Load conversations if not loaded
		if (this.conversations === null) {
			await this.loadConversations();
		}

		this.activeModal = new ConversationSelectModal(
			this.app,
			this.storage,
			this.conversations || [],
			conversation => {
				this.activeModal = null;
				if (conversation) {
					this.onSelectConversation(conversation.id);
				}
			},
			this
		);

		this.activeModal.open();

		this.activeModal.onClose = () => {
			this.activeModal = null;
		};
	}

	/**
	 * Update selector state
	 */
	update(_conversationId: string): void {
		// Could add visual indicators for current conversation in the future
	}

	/**
	 * Destroy the selector
	 */
	destroy(): void {
		if (this.containerEl) {
			this.containerEl.empty();
		}
	}
}
