// src/hooks/usePwaInstall.js
import { useState, useEffect } from 'react';

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if the app is already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    const onPromptReady = () => setCanInstall(true);
    const onInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
    };

    window.addEventListener('pwa-prompt-ready', onPromptReady);
    window.addEventListener('pwa-installed', onInstalled);

    if (window.deferredPrompt) {
      setCanInstall(true);
    }

    return () => {
      window.removeEventListener('pwa-prompt-ready', onPromptReady);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (isInstalled) {
      alert('The app is already installed.');
      return;
    }

    if (!window.deferredPrompt) {
      alert('Installation is not available. This can happen if the app is already installed, or your browser has blocked the prompt. Please use your browser menu to install the app.');
      return;
    }

    // Show the install prompt
    window.deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await window.deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again
    window.deferredPrompt = null;
    setCanInstall(false);

    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
      setIsInstalled(true);
    } else {
      console.log('User dismissed the A2HS prompt');
    }
  };

  return { promptInstall, isInstalled, canInstall };
}