// src/utils/profanity.js
// ─────────────────────────────────────────────────────────────
// ⚠️  MANUAL FILL REQUIRED
//
// Drop your blocked words/phrases below, one per line, in the
// language-specific arrays. Matching is case-insensitive and
// word-boundary-aware, so "class" will NOT match "ass" unless
// "ass" is added as its own entry.
//
// You can also list full domains (without http/https) in
// BAD_URL_HOSTS to block specific links (e.g. "shorturl.at").
// ─────────────────────────────────────────────────────────────

export const BAD_WORDS = {
  en: [
    'ass'
  ],
  fr: [
    // ← add French words here
  ],
  ar: [
    // ← add Arabic words here
  ],
};

export const BAD_URL_HOSTS = [
  'shorturl.at'
];

// ════════════════════════════════════════════════════════════════
// Helpers — you usually don't need to touch below this line
// ════════════════════════════════════════════════════════════════

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let _wordRegex = null;

function getAllWords() {
  return [
    ...BAD_WORDS.en,
    ...BAD_WORDS.fr,
    ...BAD_WORDS.ar,
  ].filter((w) => typeof w === 'string' && w.trim().length > 0);
}

export function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const words = getAllWords();
  if (words.length === 0) return false;

  if (!_wordRegex) {
    const latinWords = [...BAD_WORDS.en, ...BAD_WORDS.fr]
      .filter((w) => typeof w === 'string' && w.trim().length > 0)
      .map(escapeRegex);
    const arabicWords = BAD_WORDS.ar
      .filter((w) => typeof w === 'string' && w.trim().length > 0)
      .map(escapeRegex);

    const patterns = [];
    if (latinWords.length > 0) {
      patterns.push(`\\b(?:${latinWords.join('|')})\\b`);
    }
    if (arabicWords.length > 0) {
      patterns.push(`(?:${arabicWords.join('|')})`);
    }
    if (patterns.length > 0) {
      _wordRegex = new RegExp(patterns.join('|'), 'iu');
    }
  }

  return _wordRegex ? _wordRegex.test(text) : false;
}

export function containsBadUrl(text) {
  if (!text || BAD_URL_HOSTS.length === 0) return false;
  const lower = text.toLowerCase();
  return BAD_URL_HOSTS.some((host) => {
    const h = String(host || '').toLowerCase().trim();
    return h.length > 0 && lower.includes(h);
  });
}

export function validateMessageText(text) {
  if (containsProfanity(text)) return { ok: false, reason: 'profanity' };
  if (containsBadUrl(text)) return { ok: false, reason: 'badUrl' };
  return { ok: true };
}