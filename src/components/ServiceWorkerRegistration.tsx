"use client";

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').then(
          function (registration) {
            console.log('Service Worker registration successful with scope: ', registration.scope);
          },
          function (err) {
            console.log('Service Worker registration failed: ', err);
          }
        );
      });

      // Listen for online events to flush the queue manually in case Background Sync is unavailable (e.g., iOS Safari)
      window.addEventListener('online', () => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'FLUSH_QUEUE' });
        }
      });
    }
  }, []);

  return null;
}
