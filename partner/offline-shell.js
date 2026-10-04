/* Native APK assets are bundled. HTTPS browser installs cache only the app shell. */
if ('serviceWorker' in navigator && !window.Capacitor && !window.AxenPrinter && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; location.reload(); }
    });
    navigator.serviceWorker.register('offline-worker.js').then(registration => registration.update()).catch(() => {});
  });
}
