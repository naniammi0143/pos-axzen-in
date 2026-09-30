window.AxzenVersion = (() => {
  const bundledVersion = '3.82.0';
  function current() {
    try {
      const raw=window.AxzenUpdater?.current?.();
      const value=typeof raw==='string'?JSON.parse(raw):raw;
      if(value?.version && !/^(bundled|bundled apk)$/i.test(value.version))return String(value.version).slice(0,40);
    } catch {}
    return bundledVersion;
  }
  const client=()=>window.AxzenUpdater || window.Capacitor ? 'android' : 'web';
  return {current,client};
})();
