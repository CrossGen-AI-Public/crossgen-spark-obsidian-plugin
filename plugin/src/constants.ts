/**
 * Regex for matching @mentions
 * Matches @name at start of string or not preceded by email characters
 * Group 1: Prefix (start or space)
 * Group 2: The mention (including @)
 */
export const MENTION_REGEX = /(^|(?<![a-zA-Z0-9._]))(@[\w-]+\/?)/g;

/**
 * Regex for matching /commands
 * Matches /command at start of string or preceded by whitespace
 * Group 1: The command (including /)
 */
export const COMMAND_REGEX = /(?:^|\s)(\/[\w-]+)/g;

/**
 * Regex for validating agent names
 * Starts with letter, can contain letters, numbers, underscores, hyphens
 */
export const AGENT_NAME_REGEX = /^@([a-z][a-z0-9_-]*)$/i;

/**
 * Regex for extracting timestamp from chat filename
 * Matches chat-{timestamp}.json
 */
export const CHAT_FILENAME_REGEX = /chat-(\d+)\.json$/;

/**
 * Regex for escaping special characters in a string for use in a RegExp
 */
export const REGEX_ESCAPE_PATTERN = /[-\\^$*+?.()|[\]{}]/g;

/**
 * Regex for matching agent prefix in messages (e.g. "@agent ")
 */
export const AGENT_PREFIX_REGEX = /^@\w+\s*/;

/**
 * Regex for matching newlines globally
 */
export const NEWLINE_REGEX = /\n/g;

/**
 * Regex for matching inline chat start marker
 */
export const INLINE_CHAT_START_MARKER_REGEX = /<!--\s*spark-inline-[\w-]+-start\s*-->/;

/**
 * Regex for matching inline chat pending marker
 */
export const INLINE_CHAT_PENDING_MARKER_REGEX = /<!--\s*spark-inline-chat:pending:/;

/**
 * Regex for matching temporary marker block (start to end)
 */
export const TEMP_MARKER_BLOCK_REGEX =
	/<!--\s*spark-inline-[\w-]+-start\s*-->\n[\s\S]*?<!--\s*spark-inline-[\w-]+-end\s*-->\n?/g;

/**
 * Regex for matching engine marker block (pending to end)
 */
export const ENGINE_MARKER_BLOCK_REGEX =
	/<!--\s*spark-inline-chat:pending:[\w-]+:[^>]+\s*-->\n[\s\S]*?<!--\s*\/spark-inline-chat\s*-->\n?/g;

/**
 * Default chat window dimensions
 */
export const DEFAULT_CHAT_WIDTH = 512;
export const DEFAULT_CHAT_HEIGHT = 682;
export const DEFAULT_CHAT_RIGHT = 0;
export const DEFAULT_CHAT_BOTTOM = 27;
