window.AxzenAppUpdater = (() => {
  let context = null, release = null, checking = false, installing = false, timer = null, generation = 0;
  let state = 'idle', message = '', dialog = null, opener = null;
  const native = () => window.AxzenUpdater && typeof window.AxzenUpdater.installBundle === 'function';
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return {}; } };
  const current = () => native() ? parse(window.AxzenUpdater.current()) : {};
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function emit(next, text) {
    state = next; message = text;
    window.dispatchEvent(new CustomEvent('axzen-update-status', {detail:{state, message, release}}));
    render();
  }
  function render() {
    document.querySelectorAll('[data-app-notifications]').forEach(button => {
      button.classList.toggle('has-app-update', !!release);
      button.setAttribute('aria-label', release ? 'Notifications: update available' : 'Notifications');
      button.querySelector('.app-update-badge')?.remove();
      if (release) button.insertAdjacentHTML('beforeend', '<span class="app-update-badge" aria-hidden="true">1</span>');
    });
    if (!dialog) return;
    dialog.innerHTML = `<div class="app-update-heading"><h2>Notifications</h2><button type="button" data-update-close aria-label="Close notifications">Close</button></div>${release ? `<article class="app-update-card"><span class="app-update-label">APP UPDATE</span><h3>Version ${esc(release.version)} is ready</h3><p>${esc(release.notes || 'A new POS update is available for your organization.')}</p><small>${(Number(release.size || 0) / 1048576).toFixed(2)} MB · Save your current work before updating.</small><button type="button" data-update-install ${installing || checking || !native() ? 'disabled' : ''}>${installing ? 'Updating…' : state === 'error' ? 'Retry update' : 'Update now'}</button>${!native() ? '<p>Open the Android POS app to install this update.</p>' : ''}</article>` : '<p class="app-update-empty">No new updates for your organization.</p>'}<p role="status" class="app-update-status">${esc(message)}</p><button type="button" data-update-check ${checking || installing ? 'disabled' : ''}>Check for updates</button>`;
  }
  async function request(path, config) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      return await fetch(config.apiBase + path, {headers:{Authorization:`Bearer ${config.token}`,'X-Axzen-App-Version':current().version || 'Bundled APK'}, cache:'no-store', signal:controller.signal});
    } finally { clearTimeout(timeout); }
  }
  async function assigned(config) {
    const response = await request('/app-update/manifest', config);
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok || !data.release) throw Error(data.message || 'Update check failed');
    return current().sha256 === data.release.sha256 ? null : data.release;
  }
  async function check(config = context) {
    if (!config?.token || checking || installing || !navigator.onLine) return;
    const run = generation;
    checking = true; render();
    try {
      const next = await assigned(config);
      if (run !== generation) return;
      release = next;
      emit(next ? 'available' : 'idle', next ? 'Update available. Tap Update now to install.' : 'You are up to date.');
    } catch (error) { if (run === generation) emit('error', error.message || 'Could not check for updates. Please retry.'); }
    finally { if (run === generation) { checking = false; render(); } }
  }
  async function install() {
    if (!context || !native() || installing || checking) return;
    const run = generation, config = {...context};
    installing = true;
    try {
      emit('checking', 'Checking the update assigned to your organization…');
      const next = await assigned(config);
      if (run !== generation) return;
      release = next;
      if (!next) { emit('idle', 'No pending update.'); return; }
      emit('downloading', `Downloading version ${next.version}…`);
      const response = await request(next.downloadUrl, config);
      if (!response.ok) throw Error('Update download failed. Please retry.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (run !== generation) return;
      let binary = '';
      for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i+32768, bytes.length)));
      emit('installing', `Installing version ${next.version}…`);
      const result = parse(window.AxzenUpdater.installBundle(btoa(binary), next.version, next.sha256, next.signature));
      if (!result.success) throw Error(result.message || 'Update install failed');
      release = null;
      emit('installed', 'Update installed. Restarting POS…');
    } catch (error) { if (run === generation) emit('error', error.message || 'Update failed. Please retry.'); }
    finally { if (run === generation) { installing = false; render(); } }
  }
  function close() { if (dialog) { dialog.remove(); dialog = null; opener?.focus(); } }
  function open(button) {
    if (!context) return;
    if (!dialog) {
      opener = button;
      dialog = document.createElement('dialog'); dialog.className = 'app-update-dialog';
      dialog.setAttribute('aria-label', 'Update notifications'); document.body.appendChild(dialog);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-update-close]')) close();
        else if (event.target.closest('[data-update-install]')) install();
        else if (event.target.closest('[data-update-check]')) check();
      });
      render();
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    check();
  }
  function stop() {
    generation++; clearInterval(timer); timer = null; context = null; release = null;
    checking = false; installing = false; state = 'idle'; message = ''; close(); render();
  }
  function start(config) {
    stop(); context = {...config}; check();
    timer = setInterval(() => { if (!document.hidden) check(); }, 30000);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-app-notifications]'); if (button) open(button);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', () => check());
  function markHealthy() { if (native() && typeof window.AxzenUpdater.markHealthy === 'function') window.AxzenUpdater.markHealthy(); }
  return {check, start, stop, install, markHealthy, back: () => { if (!dialog) return false; close(); return true; }};
})();
