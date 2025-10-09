# Fuzzy Matching Algorithm - Improvement Plan

## Current Status (Phase 2)
✅ **Good enough** for initial release with small datasets (<1000 items)

## Recommended Improvements for Phase 3

### 1. Consecutive Character Bonus (High Priority)
**Problem:** `sum` matches `su_m_mary` same as `summarize`  
**Solution:** Add bonus for consecutive character matches

```typescript
private fuzzyMatchScore(query: string, text: string): number {
    let queryIndex = 0;
    let textIndex = 0;
    let matchCount = 0;
    let consecutiveBonus = 0;
    let inConsecutive = false;

    while (queryIndex < query.length && textIndex < text.length) {
        if (query[queryIndex] === text[textIndex]) {
            matchCount++;
            if (inConsecutive) {
                consecutiveBonus += 0.15; // Bonus for consecutive matches
            }
            inConsecutive = true;
            queryIndex++;
        } else {
            inConsecutive = false;
        }
        textIndex++;
    }

    if (matchCount !== query.length) {
        return 0;
    }

    return (matchCount / text.length) + consecutiveBonus;
}
```

### 2. Position-Aware Scoring (High Priority)
**Problem:** Match at character 10 scores same as match at character 0  
**Solution:** Add bonus for matches at beginning or after word boundaries

```typescript
private fuzzyMatchScore(query: string, text: string): number {
    let queryIndex = 0;
    let textIndex = 0;
    let matchCount = 0;
    let positionBonus = 0;
    let consecutiveBonus = 0;
    let inConsecutive = false;

    while (queryIndex < query.length && textIndex < text.length) {
        if (query[queryIndex] === text[textIndex]) {
            matchCount++;
            
            // Position bonus
            if (textIndex === 0) {
                positionBonus += 0.2; // Start of string
            } else if (text[textIndex - 1] === ' ' || text[textIndex - 1] === '-') {
                positionBonus += 0.15; // Start of word
            }
            
            // Consecutive bonus
            if (inConsecutive) {
                consecutiveBonus += 0.15;
            }
            inConsecutive = true;
            queryIndex++;
        } else {
            inConsecutive = false;
        }
        textIndex++;
    }

    if (matchCount !== query.length) {
        return 0;
    }

    return Math.min(1.0, (matchCount / text.length) + positionBonus + consecutiveBonus);
}
```

### 3. CamelCase Matching (Medium Priority)
**Problem:** Can't type `fb` to match `FooBar` or `betty` to match `@BettySmith`  
**Solution:** Treat uppercase letters as word boundaries

```typescript
private isCamelCaseBoundary(text: string, index: number): boolean {
    if (index === 0) return true;
    const current = text[index];
    const previous = text[index - 1];
    
    // Current is uppercase and previous is lowercase
    return current === current.toUpperCase() && 
           previous === previous.toLowerCase() &&
           current !== previous;
}

private fuzzyMatchScore(query: string, text: string): number {
    // ... existing code ...
    
    // Add to position bonus calculation
    if (this.isCamelCaseBoundary(text, textIndex)) {
        positionBonus += 0.15; // CamelCase boundary
    }
}
```

### 4. Gap Penalty (Low Priority)
**Problem:** Large gaps between matches aren't penalized  
**Solution:** Add penalty based on distance between matched characters

```typescript
private fuzzyMatchScore(query: string, text: string): number {
    let lastMatchIndex = -1;
    let gapPenalty = 0;
    
    while (queryIndex < query.length && textIndex < text.length) {
        if (query[queryIndex] === text[textIndex]) {
            if (lastMatchIndex !== -1) {
                const gap = textIndex - lastMatchIndex;
                if (gap > 1) {
                    gapPenalty += (gap - 1) * 0.01; // Small penalty per gap
                }
            }
            lastMatchIndex = textIndex;
            // ... rest of matching logic ...
        }
    }
    
    return Math.max(0, (matchCount / text.length) + bonuses - gapPenalty);
}
```

## Implementation Strategy

1. **Phase 2 (Current):** Keep simple algorithm ✅
2. **Phase 3:** Add improvements #1 and #2 (consecutive + position)
3. **Phase 4+:** Consider #3 and #4 based on user feedback

## Testing Scenarios

After implementing improvements, test with:
- `sum` → should rank `summarize` > `summary-2024` > `summer-notes`
- `bs` → should match `@BettySmith` (CamelCase)
- `fin` → should rank `finance/` > `definitions/`
- `rep` → should rank `report` > `sales-report` (position bonus)

## References

- **fzf algorithm:** Character position bonuses, gap penalties, consecutive bonuses
- **VSCode Quick Open:** Path-aware, CamelCase, continuous matching
- **Levenshtein Distance:** Too slow for real-time (O(n*m) on every keystroke)
- **Jaro-Winkler:** Good for typos, but overkill for command palette

## Conclusion

Current algorithm is **simple, fast, and sufficient** for Phase 2. The proposed improvements are **incremental enhancements** that can be added based on user feedback without changing the core architecture.

