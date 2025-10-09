import { PaletteItem } from '../types/command-palette';

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
	 * All characters must be present in order
	 */
	private fuzzyMatchScore(query: string, text: string): number {
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
