// src/services/ai/aiClient.js
import { auth } from '../../firebase/config';

const ENDPOINT = import.meta.env.VITE_AI_PROXY_URL;

export class AIError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
  }
}

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new AIError('Not signed in', { code: 'no_user' });
  return `Bearer ${await user.getIdToken()}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Stream a chat completion.
 * @param {object}  opts
 * @param {Array}   opts.messages     OpenAI-format messages (system excluded)
 * @param {Array}   opts.tools        Tool definitions
 * @param {string}  opts.model
 * @param {string}  opts.locale
 * @param {string}  opts.tone
 * @param {string}  opts.appContext
 * @param {string}  opts.userContext
 * @param {AbortSignal} opts.signal
 * @param {(delta:string)=>void} opts.onDelta
 * @returns {Promise<{content:string, tool_calls?:Array}>}
 */
export async function streamAI({
  messages, tools = [], model, locale, tone,
  appContext, userContext, signal, onDelta,
}) {
  if (!ENDPOINT) throw new AIError('VITE_AI_PROXY_URL is not configured', { code: 'no_endpoint' });

  const body = JSON.stringify({
    messages, tools, model, locale, tone,
    appContext, userContext, stream: true,
  });

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runOnce(body, signal, onDelta);
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') throw err;
      const retryable =
        err.status === 429 || err.status >= 500 || err.code === 'network';
      if (!retryable || attempt === 2) throw err;
      await sleep(600 * 2 ** attempt); // 600ms, 1200ms
    }
  }
  throw lastErr;
}

async function runOnce(body, signal, onDelta) {
  const authz = await authHeader();

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authz },
      body,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new AIError('Network error', { code: 'network' });
  }

  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    throw new AIError(
      payload.message || payload.error || `Request failed (${res.status})`,
      { code: payload.error, status: res.status }
    );
  }

  if (!res.body) throw new AIError('Empty response', { code: 'empty' });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCalls = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          let chunk;
          try { chunk = JSON.parse(data); } catch { continue; }
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            onDelta?.(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0;
              if (!toolCalls[i]) {
                toolCalls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[i].id = tc.id;
              if (tc.function?.name)      toolCalls[i].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const cleaned = toolCalls.filter(Boolean).filter(tc => tc.function?.name);
  return {
    content: content.trim(),
    tool_calls: cleaned.length ? cleaned : undefined,
  };
}