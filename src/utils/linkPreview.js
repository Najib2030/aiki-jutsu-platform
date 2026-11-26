// src/utils/linkPreview.js
// ─────────────────────────────────────────────────────────────
// Link previews with microlink.io as primary + Google Favicon
// fallback. Client-side cache in localStorage so the free 50/day
// microlink quota goes to genuinely new URLs.
// ─────────────────────────────────────────────────────────────
import { extractFirstUrl } from './chat';

const CACHE_KEY = 'dojo_link_previews_v1';
const QUOTA_KEY = 'dojo_microlink_quota_v1';
const DAILY_LIMIT = 45; // leave a 5-call buffer under the free 50
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore */
  }
}

function getQuota() {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (!raw) return { day: todayKey(), used: 0 };
    const q = JSON.parse(raw);
    if (q.day !== todayKey()) return { day: todayKey(), used: 0 };
    return q;
  } catch {
    return { day: todayKey(), used: 0 };
  }
}

function bumpQuota() {
  const q = getQuota();
  q.used += 1;
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
  return q.used;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Returns a preview object:
 *   { url, title, description, image, favicon, domain, source }
 * source: 'microlink' | 'favicon' | 'cached'
 *
 * Never throws. Always returns a usable fallback.
 */
export async function getLinkPreview(rawUrl) {
  const url = rawUrl || extractFirstUrl(rawUrl);
  if (!url) return null;

  // 1. Cache hit?
  const cache = readCache();
  const hit = cache[url];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { ...hit.data, source: 'cached' };
  }

  const domain = domainOf(url);

  // 2. Try microlink within quota
  const quota = getQuota();
  if (quota.used < DAILY_LIMIT) {
    try {
      const res = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(url)}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.status === 'success' && json.data) {
          const data = {
            url,
            title: json.data.title || domain,
            description: json.data.description || '',
            image: json.data.image?.url || '',
            favicon: json.data.logo?.url
              || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
            domain,
          };
          cache[url] = { data, ts: Date.now() };
          writeCache(cache);
          bumpQuota();
          return { ...data, source: 'microlink' };
        }
      }
    } catch {
      /* network or quota — fall through to favicon */
    }
  }

  // 3. Fallback — Google favicon only
  const data = {
    url,
    title: domain,
    description: '',
    image: '',
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    domain,
  };
  cache[url] = { data, ts: Date.now() };
  writeCache(cache);
  return { ...data, source: 'favicon' };
}

/**
 * Given a message, returns the first resolvable link preview (async).
 * Returns null when the message has no URL.
 */
export async function previewFirstLink(text) {
  const url = extractFirstUrl(text);
  if (!url) return null;
  return getLinkPreview(url);
}