// src/utils/progressEvents.js
const EVENT_NAME = 'dojo:progress-changed';

export function emitProgressChanged(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch (err) {
    // Defensive: very old browsers / SSR
    console.error('Failed to dispatch progress event:', err);
  }
}

export function onProgressChanged(handler) {
  const wrapped = (e) => {
    try {
      handler(e.detail || {});
    } catch (err) {
      console.error('Progress event handler failed:', err);
    }
  };
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}