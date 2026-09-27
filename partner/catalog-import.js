window.CatalogImport = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = url => /^https:\/\//i.test(url || '') ? url : '';
  const matchKey = name => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function matchCatalog(items, catalog) {
    const matched = items.map(item => {
      const matches = catalog.filter(row => matchKey(row.name) === matchKey(item.name));
      const existing = matches.find(row => row.active) || matches.find(row => row.image) || matches[0];
      if (!existing) return {...item, matchStatus:'New item'};
      return {...item, name:existing.name, image:existing.image || item.image || '', imageCredit:existing.imageCredit,
        category: item.category === 'General' ? (existing.category || item.category) : item.category,
        unit: existing.unit || item.unit, matchStatus:existing.active ? 'Already in your menu' : 'Matched existing catalog', selected:!existing.active};
    });
    const counts = new Map();
    matched.forEach(item => counts.set(matchKey(item.name), (counts.get(matchKey(item.name)) || 0) + 1));
    return matched.map(item => ({...item, duplicateIssue: counts.get(matchKey(item.name)) > 1
      ? 'This name appears more than once in the upload. Rename or remove one before Proceed.' : ''}));
  }
  function open(options) {
    if (document.getElementById('catalogDialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'catalogDialog'; dialog.className = 'catalog-dialog';
    let items = [], busy = false, message = '', reviewed = false, file = null, choices = new Map();
    document.body.append(dialog);
    const close = () => { if (busy) return; if (items.some(i => !i.saved) && !confirm('Discard this catalog review?')) return; dialog.close(); dialog.remove(); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    function render() {
      dialog.innerHTML = `<header><div><small>AI MENU IMPORT</small><h2>Upload menu card</h2></div><button data-action="close" aria-label="Close catalog">×</button></header><p>Upload a brochure or food menu card. AI reads the items and fills a photo link from online. Nothing is added until you confirm.</p><p class="catalog-message" role="status">${esc(message)}</p>${!items.length ? `<label class="catalog-drop">Choose a brochure or menu card<input id="catalogFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv"></label><p>PDF or photo, up to 5 MB and 100 items. Review the list, then add the ones you confirm.</p><button data-action="extract">Read menu</button>` : `<div class="catalog-list">${items.map((item, i) => `<article class="catalog-item" data-row="${i}"><p class="catalog-match">${esc(item.matchStatus || "New item")}</p><div class="catalog-item-head"><label><input type="checkbox" data-field="selected" ${item.selected ? 'checked' : ''} ${item.saved ? 'disabled' : ''}> ${item.saved ? 'Added' : 'Include item '+(i+1)}</label><button data-action="remove" data-index="${i}" ${item.saved ? 'disabled' : ''}>Remove</button></div><div class="catalog-fields"><div class="catalog-picture">${safe(item.image) ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">` : '<span>No image</span>'}<button data-action="images" data-index="${i}">Find / change image</button></div><div><label>Name<input data-field="name" value="${esc(item.name)}" required></label><label>Price (₹)<input data-field="price" type="number" min="0" step="0.01" value="${item.price ?? ''}" required></label><label>Category<input data-field="category" value="${esc(item.category)}"></label><label>Unit<input data-field="unit" value="${esc(item.unit)}"></label><label>Image URL<input data-field="image" value="${esc(item.image)}" placeholder="https://..."></label></div></div><div class="catalog-images">${(choices.get(item) || []).map((image, j) => `<div><button data-action="pick" data-index="${i}" data-choice="${j}"><img src="${esc(safe(image.url))}" alt="Image option ${j+1}" loading="lazy"></button><a href="${esc(safe(image.source))}" target="_blank" rel="noopener">${esc(image.license)} ? ${esc(image.author || "Source")}</a></div>`).join('')}</div>${[item.duplicateIssue,item.imageIssue,item.issue].filter(Boolean).map(issue => `<p class="catalog-warning">${esc(issue)}</p>`).join('')}</article>`).join('')}</div><footer><label><input id="catalogReviewed" type="checkbox" ${reviewed ? 'checked' : ''}> I checked names, prices, categories and images.</label><button data-action="proceed" ${!reviewed ? 'disabled' : ''}>Confirm and add selected items</button></footer>`}`;
      if (busy) dialog.querySelectorAll('button,input').forEach(el => el.disabled = true);
      dialog.querySelectorAll('[data-row]').forEach(row => { if (items[Number(row.dataset.row)].saved) row.querySelectorAll('input,button').forEach(el => el.disabled = true); });
    }
    dialog.addEventListener('input', e => {
      if (e.target.id === 'catalogFile') { file = e.target.files[0]; return; }
      if (e.target.id === 'catalogReviewed') { reviewed = e.target.checked; dialog.querySelector('[data-action="proceed"]').disabled = !reviewed; return; }
      const row = e.target.closest('[data-row]'); if (!row || !e.target.dataset.field) return;
      const item = items[Number(row.dataset.row)], field = e.target.dataset.field;
      item[field] = field === 'selected' ? e.target.checked : field === 'price' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
      if (field === "image") item.imageCredit = undefined;
      reviewed = false; dialog.querySelector('#catalogReviewed').checked = false; dialog.querySelector('[data-action="proceed"]').disabled = true;
    });
    async function findImages(item) {
      try { const data = await options.api('/catalog/import/images?q=' + encodeURIComponent(item.name), { timeoutMs: 15000 }); choices.set(item, data.images); if (!item.image && data.images.length) { item.image = data.images[0].url; item.imageCredit = data.images[0]; } item.imageIssue = data.images.length ? '' : 'No matching reusable image. Try another name or paste your image URL.'; }
      catch (e) { item.imageIssue = e.message; }
    }
    dialog.addEventListener('click', async e => {
      const button = e.target.closest('[data-action]'); if (!button || busy) return;
      const action = button.dataset.action, index = Number(button.dataset.index);
      if (action === 'close') return close();
      if (action === 'remove') { items.splice(index, 1); reviewed = false; render(); return; }
      if (action === 'pick') { items[index].imageCredit = choices.get(items[index])[Number(button.dataset.choice)]; items[index].image = items[index].imageCredit.url; reviewed = false; render(); return; }
      busy = true;
      try {
        if (action === 'extract') {
          if (!file) throw Error('Choose a catalog file first.');
          if (file.size > 5 * 1024 * 1024) throw Error('Choose a file smaller than 5 MB.');
          message = 'Reading catalog…'; render();
          const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(Error('Could not read file.')); reader.readAsDataURL(file); });
          const result = await options.api('/catalog/import/preview', { method:'POST', body:JSON.stringify({filename:file.name,data}), timeoutMs:100000 });
          const catalog = await options.api('/catalog/all-items', { timeoutMs:15000 });
          items = matchCatalog(result.items, catalog); message = `${items.length} items read (${result.method}). Matched with existing catalog. Finding missing images…`; render();
          // Bounded sequential lookup avoids flooding the image provider.
          let cursor = 0; await Promise.all(Array.from({length: Math.min(3, items.length)}, async () => { while (cursor < items.length) { const item = items[cursor++]; if (!item.image) await findImages(item); render(); } }));
          message = 'Review every item. Edit or remove anything before Proceed.';
        }
        if (action === 'images') { message = 'Finding alternative images…'; render(); await findImages(items[index]); reviewed = false; message = 'Choose an image below the item, or paste your own URL.'; }
        if (action === 'proceed') {
          if (!reviewed) throw Error('Review the items first.');
          const selected = items.filter(i => i.selected && !i.saved);
          if (!selected.length) throw Error('Select at least one new item.');
          const seen = new Set();
          for (const item of selected) {
            const key = matchKey(item.name);
            if (!key || item.price === null || !Number.isFinite(item.price) || item.price < 0) throw Error('Every selected item needs a name and valid price.');
            if (seen.has(key)) throw Error('Duplicate item name: '+item.name); seen.add(key);
            if (item.image && !safe(item.image)) throw Error('Image URLs must start with https://');
          }
          message = 'Adding reviewed items…'; render();
          const existing = await options.api('/catalog/all-items', { timeoutMs:15000 });
          const names = new Set(existing.filter(i=>i.active).map(i=>matchKey(i.name)));
          for (const item of selected) {
            if (names.has(matchKey(item.name))) { item.issue='Already in your menu; skipped to preserve the existing item.'; continue; }
            await options.api('/products', { method:'POST', body:JSON.stringify({name:item.name.trim(),price:item.price,category:item.category,unit:item.unit,image:item.image,imageCredit:item.imageCredit}),timeoutMs:15000 });
            item.saved=true; names.add(matchKey(item.name)); render();
          }
          await options.onSaved(); message='Import complete. Added items are marked above; duplicates were skipped.';
        }
      } catch(e) { message=e.message+' Any items already marked Added remain saved.'; }
      finally { busy=false; render(); }
    });
    render(); dialog.showModal();
  }
  return {open, matchCatalog};
})();
