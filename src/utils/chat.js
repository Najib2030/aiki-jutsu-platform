// src/utils/chat.js
// ─────────────────────────────────────────────────────────────
// Formatting, markdown rendering, mentions, date separators.
// ─────────────────────────────────────────────────────────────

export const MAX_MESSAGE_LENGTH = 3000;

// ════════════════════════════════════════════════════════════════
// Time
// ════════════════════════════════════════════════════════════════
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMessageTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFullTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Date separators — "Today", "Yesterday", else localized date
export function formatDateSeparator(value, t) {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const local = new Date(d);
  local.setHours(0, 0, 0, 0);

  if (local.getTime() === today.getTime()) return t('date.today');
  if (local.getTime() === yesterday.getTime()) return t('date.yesterday');
  return local.toLocaleDateString([], {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function getDateKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatTimeAgo(value, t) {
  const d = toDate(value);
  if (!d) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return t('time.justNow');
  const min = Math.floor(diff / 60);
  if (min < 60) return t('time.minutesAgo', { count: min });
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return t('time.hoursAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('time.weeksAgo', { count: weeks });
  const months = Math.floor(days / 30);
  return t('time.monthsAgo', { count: months });
}

// ════════════════════════════════════════════════════════════════
// URLs
// ════════════════════════════════════════════════════════════════
const URL_RE = /(https?:\/\/[^\s<>"]+)/gi;

export function extractUrls(text) {
  if (!text) return [];
  const found = String(text).match(URL_RE);
  return found ? [...new Set(found)] : [];
}

export function extractFirstUrl(text) {
  const urls = extractUrls(text);
  return urls[0] || null;
}

// ════════════════════════════════════════════════════════════════
// Mentions
// ════════════════════════════════════════════════════════════════
// We support two formats:
//   1) Legacy plain "@Name" typed manually (resolved against known users)
//   2) Structured mentions inserted via autocomplete picker — stored
//      directly in `msg.mentions` (array of uids).
//
// For rendering, we scan the text for "@Name" and, if the name matches
// a known member, we style it as a chip. Manual mentions resolve too.

/**
 * Find the "@..." fragment currently under the cursor, if any.
 * Returns { query, start } where `start` is the index of '@',
 * or null if not currently mentioning.
 */
export function detectMentionPrefix(text, caretPos) {
  if (!text) return null;
  const before = text.slice(0, caretPos);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  // Must be start of string or preceded by whitespace
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const fragment = before.slice(at + 1);
  // Abort if user already typed a space (they're past the name)
  if (/\s/.test(fragment)) return null;
  return { query: fragment, start: at };
}

/**
 * Given a text and a user list, returns a Map<displayName, uid>
 * for all "@Name" occurrences found. Names are matched longest-first
 * so "@Sensei Ali" wins over "@Sensei".
 */
export function resolveMentions(text, knownUsers) {
  const out = new Set();
  if (!text || !knownUsers?.length) return [];
  const sorted = [...knownUsers].sort(
    (a, b) => (b.name || '').length - (a.name || '').length
  );
  for (const u of sorted) {
    const name = (u.name || '').trim();
    if (!name) continue;
    const needle = `@${name}`;
    // Ensure the match isn't part of a longer word
    const re = new RegExp(
      `(^|\\s)${escapeRegex(needle)}(?=$|\\s|[.,!?;:])`,
      'u'
    );
    if (re.test(text)) out.add(u.id);
  }
  return [...out];
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ════════════════════════════════════════════════════════════════
// Markdown renderer — safe (escapes HTML first!)
// ════════════════════════════════════════════════════════════════
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a message body to a safe HTML string for dangerouslySetInnerHTML.
 *
 * Order:
 *   1. Escape all HTML (blocks any injection)
 *   2. Extract and replace URLs with safe <a> tags
 *   3. Apply **bold**, *italic*, `code`
 *   4. Highlight @mentions that resolve to a known member
 *
 * All user input is escaped BEFORE any markdown transform, so no
 * script can survive.
 */
export function renderMessageHtml(text, knownUsers) {
  if (!text) return '';

  // 1. Escape everything
  let html = escapeHtml(text);

  // 2. URLs — linkify (they're already escaped, so safe)
  const urlPlaceholders = [];
  html = html.replace(URL_RE, (url) => {
    const idx = urlPlaceholders.length;
    urlPlaceholders.push(url);
    return `\u0001URL${idx}\u0001`;
  });

  // 3. Markdown — bold, italic, inline code
  //    (order matters: code first so bold/italic inside code stay literal)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // 4. Mentions — highlight @Name where Name matches a known user
  if (knownUsers?.length) {
    const sortedNames = [...knownUsers]
      .map((u) => u.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
      const needle = `@${escapeHtml(name)}`;
      const re = new RegExp(
        `(^|\\s)(${escapeRegex(needle)})(?=$|\\s|[.,!?;:])`,
        'gu'
      );
      html = html.replace(
        re,
        `$1<span class="chat-mention">$2</span>`
      );
    }
  }

  // 5. Restore URLs
  html = html.replace(/\u0001URL(\d+)\u0001/g, (_, i) => {
    const url = urlPlaceholders[Number(i)];
    const safe = escapeHtml(url);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
  });

  // 6. Newlines → <br> (do this last so no markdown spans a line break)
  html = html.replace(/\n/g, '<br/>');

  return html;
}

// ════════════════════════════════════════════════════════════════
// Message body validation (used by composer)
// ════════════════════════════════════════════════════════════════
export function isMessageEmpty(text, hasAttachments = false) {
  const t = (text || '').trim();
  return t.length === 0 && !hasAttachments;
}

export function isOverLimit(text) {
  return (text || '').length > MAX_MESSAGE_LENGTH;
}

// ════════════════════════════════════════════════════════════════
// Group messages by day (for date separators)
// ════════════════════════════════════════════════════════════════
// Input: array of messages sorted by createdAt ASC.
// Output: array of { type:'date', key, ts } | { type:'message', msg }.
export function groupMessagesWithDates(messages) {
  const out = [];
  let lastKey = null;
  for (const m of messages) {
    const key = getDateKey(m.createdAt);
    if (key && key !== lastKey) {
      out.push({ type: 'date', key, ts: m.createdAt });
      lastKey = key;
    }
    out.push({ type: 'message', msg: m });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// Scroll helpers
// ════════════════════════════════════════════════════════════════
export const AT_BOTTOM_THRESHOLD = 120; // px

export function isNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
}