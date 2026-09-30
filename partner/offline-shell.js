/* Native APK assets are bundled. HTTPS browser installs cache only the app shell. */
if ('serviceWorker' in navigator && !window.Capacitor && !window.AxenPrinter && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('offline-worker.js').catch(() => {}));
}
