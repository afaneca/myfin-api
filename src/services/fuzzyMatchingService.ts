import * as fuzzball from 'fuzzball';

export type FuzzySuggestion = {
  id: bigint;
  score: number; // 0..100
  name: string;
};

/**
 * Normalizes a string for fuzzy matching by:
 * - Removing diacritics (accents)
 * - Removing special characters (keeping only letters, numbers, spaces)
 * - Converting to uppercase
 * - Trimming and collapsing multiple spaces
 *
 * @param input - The string to normalize
 * @returns The normalized string
 */
export const normalizeForFuzzyMatch = (input: string): string => {
  if (!input) return '';
  return (
    input
      .normalize('NFD')
      // remove diacritics
      .replace(/\p{Diacritic}/gu, '')
      // keep letters/numbers/spaces only
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
  );
};

/**
 * Finds the best fuzzy match from a list of candidates using token_set_ratio algorithm.
 * This works well for text with "noise" (e.g., "COMPRA LIDL VAGOS" matching "LIDL").
 *
 * @param haystackRaw - The text to search within (e.g., transaction description)
 * @param candidates - Array of candidates to match against (must have id and name properties)
 * @param threshold - Minimum score (0-100) required for a match
 * @returns The best matching candidate or null if no match above threshold
 */
export const getBestFuzzyMatch = (
  haystackRaw: string,
  candidates: Array<{ id: bigint; name: string }>,
  threshold: number
): FuzzySuggestion | null => {
  const haystack = normalizeForFuzzyMatch(haystackRaw);
  if (!haystack) return null;

  let best: FuzzySuggestion | null = null;
  let bestNormalizedName = '';

  for (const c of candidates) {
    const needle = normalizeForFuzzyMatch(c.name);
    if (!needle) continue;

    const score = fuzzball.token_set_ratio(haystack, needle);

    if (
      score >= threshold &&
      (!best ||
        score > best.score ||
        (score === best.score && needle.length > bestNormalizedName.length))
    ) {
      best = { id: c.id, score, name: c.name };
      bestNormalizedName = needle;
    }
  }

  return best;
};

export default {
  normalizeForFuzzyMatch,
  getBestFuzzyMatch,
};
