/** "Nadia Rahman" → "NR"; uses the first and last word and works for non-Latin scripts. */
export function getInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words;
  return letters.map((word) => Array.from(word)[0].toUpperCase()).join('') || '?';
}
