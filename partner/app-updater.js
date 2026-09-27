window.AxzenAppUpdater = (() => {
  let checking = false;
  const native = () => window.AxzenUpdater && typeof window.AxzenUpdater.installBundle === 'function';
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return {}; } };
  const emit = (state, message) => window.dispatchEvent(new CustomEvent('axzen-update-status',{detail:{state,message}}));
  async function toBase64(buffer) {
    const bytes=new Uint8Array(buffer);let binary='';const size=32768;
    for(let i=0;i<bytes.length;i+=size) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+size,bytes.length)));
    return btoa(binary);
  }
  async function check({apiBase='',token=''}) {
    if (!native() || checking || !token || !navigator.onLine) return;
    checking=true;
    try {
      const current=parse(window.AxzenUpdater.current());
      const version=current.version||'Bundled APK';
      const headers={Authorization:`Bearer ${token}`,'X-Axzen-App-Version':version};
      const response=await fetch(apiBase+'/app-update/manifest',{headers,cache:'no-store'});
      if(response.status===204)return;
      const manifest=await response.json();if(!response.ok||!manifest.release)throw Error(manifest.message||'Update check failed');
      if(current.sha256===manifest.release.sha256)return;
      emit('downloading',`Downloading update ${manifest.release.version}…`);
      const bundleResponse=await fetch(apiBase+manifest.release.downloadUrl,{headers,cache:'no-store'});
      if(!bundleResponse.ok)throw Error('Update download failed');
      const base64=await toBase64(await bundleResponse.arrayBuffer());
      emit('installing',`Installing update ${manifest.release.version}…`);
      const result=parse(window.AxzenUpdater.installBundle(base64,manifest.release.version,manifest.release.sha256,manifest.release.signature));
      if(!result.success)throw Error(result.message||'Update install failed');
    } catch(error) { emit('error',error.message||'Update failed'); }
    finally { checking=false; }
  }
  function markHealthy(){if(native()&&typeof window.AxzenUpdater.markHealthy==='function')window.AxzenUpdater.markHealthy();}
  return {check,markHealthy};
})();
