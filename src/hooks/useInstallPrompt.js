// src/hooks/useInstallPrompt.js
import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    
    setIsInstalled(standalone);
    if (standalone) return;

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua));

    const handleReady = () => setCanInstall(true);
    const handleInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
    };

    window.addEventListener('pwa-prompt-ready', handleReady);
    window.addEventListener('pwa-installed', handleInstalled);

    if (window.deferredPrompt) setCanInstall(true);

    return () => {
      window.removeEventListener('pwa-prompt-ready', handleReady);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const install = async () => {
    // Read directly from window to avoid stale closures
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) {
      console.warn('No deferred prompt available');
      return false;
    }

    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    
    window.deferredPrompt = null;
    setCanInstall(false);

    if (result.outcome === 'accepted') {
      setIsInstalled(true);
      return true;
    }
    return false;
  };

  return { canInstall, isInstalled, isIos, install };
}