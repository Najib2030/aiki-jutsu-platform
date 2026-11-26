import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'                              // ← initialize i18n first
import './styles/global.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'

// ── Global PWA Install Prompt ──
// Register these listeners as early as possible so we don't miss the event.
window.deferredPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    window.dispatchEvent(new Event('pwa-prompt-ready'));
  });

  window.addEventListener('appinstalled', () => {
    window.deferredPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
}

window.addEventListener('appinstalled', () => {
  window.deferredPrompt = null;
  window.dispatchEvent(new Event('pwa-installed'));
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)

// ── Register Service Worker for PWA ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}