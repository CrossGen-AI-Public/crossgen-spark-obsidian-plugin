import type { PaletteItem } from '../types/command-palette';

interface MatchResult {
	item: PaletteItem;
	score: number;
	matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy' | 'description';
}

export class FuzzyMatcher {
	/**
	 * Match query against items and return sorted results
	 */
	match(query: string, items: PaletteItem[]): PaletteItem[] {
		if (!query || query.trim() === '') {
			return items;
		}

		const results = items
			.map(item => this.calculateMatch(query, item))
			.filter(result => result.score > 0.3) // Threshold
			.sort((a, b) => {
				// Priority: exact > prefix > contains > fuzzy > description
				if (a.matchType !== b.matchType) {
					return this.getMatchTypePriority(a.matchType) - this.getMatchTypePriority(b.matchType);
				}
				// Within same type, sort by score
				return b.score - a.score;
			});

		return results.map(r => r.item);
	}

	/**
	 * Calculate match score for an item
	 */
	private calculateMatch(query: string, item: PaletteItem): MatchResult {
		const q = query.toLowerCase();
		const name = item.name.toLowerCase();
		const id = item.id.toLowerCase();

		// Exact match on name
		if (name === q) {
			return { item, score: 1.0, matchType: 'exact' };
		}

		// Exact match on ID (without trigger char)
		const idWithoutTrigger = id.substring(1); // Remove / or @
		if (idWithoutTrigger === q) {
			return { item, score: 1.0, matchType: 'exact' };
		}

		// Prefix match on name
		if (name.startsWith(q)) {
			return { item, score: 0.9, matchType: 'prefix' };
		}

		// Prefix match on ID
		if (idWithoutTrigger.startsWith(q)) {
			return { item, score: 0.9, matchType: 'prefix' };
		}

		// Contains match on name
		if (name.includes(q)) {
			return { item, score: 0.7, matchType: 'contains' };
		}

		// Contains match on ID
		if (idWithoutTrigger.includes(q)) {
			return { item, score: 0.7, matchType: 'contains' };
		}

		// Fuzzy match (all query characters present in order)
		const fuzzyScore = this.fuzzyMatchScore(q, name);
		if (fuzzyScore > 0) {
			return { item, score: 0.5 * fuzzyScore, matchType: 'fuzzy' };
		}

		// Match in description
		if (item.description?.toLowerCase().includes(q)) {
			return { item, score: 0.4, matchType: 'description' };
		}

		// No match
		return { item, score: 0, matchType: 'fuzzy' };
	}

	/**
	 * Calculate fuzzy match score
	 * Uses multiple strategies: subsequence matching and Levenshtein distance
	 */
	private fuzzyMatchScore(query: string, text: string): number {
		// Try subsequence match first (original algorithm, fast and good for abbreviations)
		const subsequenceScore = this.subsequenceMatch(query, text);
		if (subsequenceScore > 0) {
			return subsequenceScore;
		}

		// Fall back to Levenshtein distance for typo tolerance
		const editDistanceScore = this.levenshteinMatch(query, text);
		return editDistanceScore;
	}

	/**
	 * Subsequence matching: all query characters present in order
	 * Good for abbreviations like "dcp" matching "draft-client-proposal"
	 */
	private subsequenceMatch(query: string, text: string): number {
		let queryIndex = 0;
		let textIndex = 0;
		let matchCount = 0;

		while (queryIndex < query.length && textIndex < text.length) {
			if (query[queryIndex] === text[textIndex]) {
				matchCount++;
				queryIndex++;
			}
			textIndex++;
		}

		// All query characters must be found
		if (matchCount !== query.length) {
			return 0;
		}

		// Score based on how compact the match is
		return matchCount / text.length;
	}

	/**
	 * Levenshtein distance-based matching for typo tolerance
	 * Handles insertions, deletions, and substitutions
	 */
	private levenshteinMatch(query: string, text: string): number {
		// If query is much longer than text, unlikely to match
		if (query.length > text.length * 1.5) {
			return 0;
		}

		// Try matching query against text and all substrings of text
		let bestScore = 0;

		// Check if query matches the full text reasonably well
		const fullDistance = this.levenshteinDistance(query, text);
		const maxAllowedDistance = Math.ceil(Math.max(query.length, text.length) * 0.4);

		if (fullDistance <= maxAllowedDistance) {
			const similarity = 1 - fullDistance / Math.max(query.length, text.length);
			bestScore = Math.max(bestScore, similarity * 0.8); // Scale down slightly
		}

		// Also try sliding window approach for partial matches
		// This helps when query matches a portion of the filename
		if (query.length < text.length) {
			for (let i = 0; i <= text.length - query.length; i++) {
				const substring = text.substring(i, i + query.length);
				const distance = this.levenshteinDistance(query, substring);
				const maxDistance = Math.ceil(query.length * 0.3);

				if (distance <= maxDistance) {
					const similarity = 1 - distance / query.length;
					bestScore = Math.max(bestScore, similarity * 0.9);
				}
			}
		}

		return bestScore;
	}

	/**
	 * Calculate Levenshtein distance between two strings
	 * Returns minimum number of single-character edits needed
	 */
	private levenshteinDistance(a: string, b: string): number {
		const matrix: number[][] = [];

		// Initialize matrix
		for (let i = 0; i <= a.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= b.length; j++) {
			matrix[0][j] = j;
		}

		// Fill matrix
		for (let i = 1; i <= a.length; i++) {
			for (let j = 1; j <= b.length; j++) {
				if (a[i - 1] === b[j - 1]) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j] + 1, // deletion
						matrix[i][j - 1] + 1, // insertion
						matrix[i - 1][j - 1] + 1 // substitution
					);
				}
			}
		}

		return matrix[a.length][b.length];
	}

	/**
	 * Get priority value for match type (lower is better)
	 */
	private getMatchTypePriority(matchType: MatchResult['matchType']): number {
		const priorities: Record<MatchResult['matchType'], number> = {
			exact: 1,
			prefix: 2,
			contains: 3,
			fuzzy: 4,
			description: 5,
		};
		return priorities[matchType];
	}
}
