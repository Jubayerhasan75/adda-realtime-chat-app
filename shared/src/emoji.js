/**
 * True when `value` is exactly one emoji (including skin tones, flags and ZWJ sequences such
 * as 👩\u200D💻). Uses the precise Unicode RGI_Emoji property where the JavaScript engine supports
 * the `v` regex flag (Node 20+, Chrome 112+, Safari 17+); older browsers such as iOS 16 Safari
 * fall back to "one grapheme that contains a pictographic character". The server always runs
 * the precise check.
 */
let rgiEmoji = null;
try {
  rgiEmoji = new RegExp(String.raw`^\p{RGI_Emoji}$`, 'v');
} catch {
  rgiEmoji = null;
}

export function isSingleEmoji(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32) return false;
  if (rgiEmoji) return rgiEmoji.test(value);
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}
