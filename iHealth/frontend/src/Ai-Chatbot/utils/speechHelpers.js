/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Speech and voice utility functions for the Ai-Chatbot frontend module.
 *         Contraction expansion, echo filtering, and overlap detection.
 */

/**
 * Expands common English contractions for better text comparison.
 * @param {string} text - Input text with possible contractions
 * @returns {string} Text with contractions expanded
 */
export function expandContractions(text) {
  const map = {
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are", "i've": "i have",
    "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will",
    "we'll": "we will", "they'll": "they will", "i'd": "i would", "you'd": "you would",
    "he'd": "he would", "she'd": "she would", "we'd": "we would", "they'd": "they would",
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "won't": "will not", "wouldn't": "would not", "can't": "cannot",
    "couldn't": "could not", "shouldn't": "should not", "mustn't": "must not",
    "let's": "let us", "that's": "that is", "who's": "who is",
    "what's": "what is", "here's": "here is", "there's": "there is",
    "where's": "where is", "how's": "how is",
  };

  let result = text;
  for (const [contraction, expanded] of Object.entries(map)) {
    result = result.replace(new RegExp(contraction.replace("'", "[''']"), "gi"), expanded);
  }
  return result;
}

/**
 * Strips AI echo prefix from speech recognition text.
 * Compares user speech against recently spoken AI text to remove overlapping echoes.
 * @param {string} rawSpeechText - Raw speech recognition output
 * @param {string} rawAiText - Combined AI spoken text for comparison
 * @returns {string} Cleaned speech text with echo prefix removed
 */
export function stripAIEchoPrefix(rawSpeechText, rawAiText) {
  const speechWords = expandContractions(rawSpeechText).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const aiWords = expandContractions(rawAiText).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);

  if (speechWords.length === 0) return "";
  if (aiWords.length === 0) return rawSpeechText;

  let longestMatchLen = 0;
  for (let start = 0; start < aiWords.length; start++) {
    let matchLen = 0;
    while (
      matchLen < speechWords.length &&
      start + matchLen < aiWords.length &&
      speechWords[matchLen] === aiWords[start + matchLen]
    ) {
      matchLen++;
    }
    if (matchLen > longestMatchLen) {
      longestMatchLen = matchLen;
    }
  }

  if (longestMatchLen >= 2) {
    const originalWords = rawSpeechText.trim().split(/\s+/);
    const remaining = originalWords.slice(longestMatchLen).join(" ").trim();
    return remaining;
  }

  return rawSpeechText;
}

/**
 * Calculates word overlap ratio between two texts.
 * @param {string} text1
 * @param {string} text2
 * @returns {number} Overlap ratio (0 to 1)
 */
export function getWordOverlapRatio(text1, text2) {
  const words1 = expandContractions(text1).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const words2 = expandContractions(text2).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);

  if (words1.length === 0 || words2.length === 0) return 0;

  const set2 = new Set(words2);
  let overlapCount = 0;
  for (const word of words1) {
    if (set2.has(word)) overlapCount++;
  }

  return overlapCount / words1.length;
}
