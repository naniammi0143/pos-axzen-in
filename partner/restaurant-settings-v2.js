window.RestaurantSettings = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(root, { api, settings, onSaved = () => {} }) {
    let tables = [], config = BillTaxes.normalize(settings.taxSettings), message = '';
    function draw() {
      root.innerHTML = `<section class="rs-panel"><h2>Tax settings</h2><p>Enter a percentage and tick only the tax that must appear on the bill. CGST and SGST are selected together automatically.</p><form id="rs-tax-form"><div class="rs-tax-list">${config.rows.map(r => `<label class="rs-tax-row"><span><input type="checkbox" data-tax="${r.id}" ${r.enabled?'checked':''}> ${r.name}</span><span><input aria-label="${r.name} percentage" type="number" data-rate="${r.id}" min="0" max="100" step="0.01" value="${r.rate}"> %</span></label>`).join('')}</div><p class="rs-help">Choose GST, CGST + SGST, IGST, or VAT. The selected tax and percentage print on every new bill. Service charge can be selected separately.</p><label>GSTIN <input id="rs-gstin" maxlength="15" value="${esc(config.gstin)}" placeholder="15-character GSTIN (optional)"></label><h3>Print on bill</h3><p>Items, subtotal, discount, checked taxes with percentages, and final total always print. Optional details:</p><div class="rs-checks">${Object.entries({area:'Restaurant address / area',cashier:'Cashier',payment:'Payment method',token:'Token number',table:'Table number',gstin:'GSTIN',footer:'Thank-you footer'}).map(([id,label])=>`<label><input type="checkbox" data-print="${id}" ${config.print[id]?'checked':''}> ${label}</label>`).join('')}</div><button type="submit">Save tax & print settings</button><p role="status" aria-live="polite" class="rs-message">${esc(message)}</p></form></section><section class="rs-panel"><h2>Table settings</h2><p>Add tables, assign floor and seats, or disable unused tables here.</p><form id="rs-table-form"><input type="hidden" id="rs-id"><div class="rs-fields"><label>Table name<input id="rs-name" required maxlength="40"></label><label>Floor<input id="rs-zone" value="Main Hall" required maxlength="40"></label><label>Seats<input id="rs-seats" type="number" min="1" max="100" step="1" value="4" required></label></div><label><input id="rs-active" type="checkbox" checked> Active table</label><button type="submit">Save table</button><button type="button" id="rs-clear">New table</button><p role="status" id="rs-table-status"></p></form><div class="rs-tables">${tables.map(t=>`<button type="button" data-edit-table="${esc(t.tableId)}"><b>Table ${esc(t.name)}</b><span>${esc(t.zone)} · ${t.seats} seats · ${esc(t.status)}</span></button>`).join('')}</div></section>`;
      const taxCheck = id => root.querySelector(`[data-tax="${id}"]`);
      const taxRate = id => root.querySelector(`[data-rate="${id}"]`);
      root.querySelectorAll('[data-tax]').forEach(input => input.onchange = () => {
        const id = input.dataset.tax;
        if (input.checked && id !== 'service') {
          const group = id === 'cgst' || id === 'sgst' ? ['cgst', 'sgst'] : [id];
          ['gst', 'cgst', 'sgst', 'igst', 'vat'].forEach(key => { taxCheck(key).checked = group.includes(key); });
          if (group.length === 2) {
            const rate = taxRate(id).value;
            taxRate(id === 'cgst' ? 'sgst' : 'cgst').value = rate;
          }
        } else if (!input.checked && (id === 'cgst' || id === 'sgst')) {
          taxCheck('cgst').checked = false; taxCheck('sgst').checked = false;
        }
      });
      ['cgst', 'sgst'].forEach(id => taxRate(id).oninput = () => {
        if (taxCheck('cgst').checked || taxCheck('sgst').checked) taxRate(id === 'cgst' ? 'sgst' : 'cgst').value = taxRate(id).value;
      });
      root.querySelector('#rs-tax-form').onsubmit = async event => {
        event.preventDefault(); const button = event.submitter; if(button) button.disabled=true;
        const status = root.querySelector('.rs-message'); status.textContent='Saving tax settings...';
        try {
          const next = BillTaxes.normalize({ gstin:root.querySelector('#rs-gstin').value, rows:config.rows.map(r=>({...r,enabled:root.querySelector(`[data-tax="${r.id}"]`).checked,rate:Number(root.querySelector(`[data-rate="${r.id}"]`).value)})), print:Object.fromEntries([...root.querySelectorAll('[data-print]')].map(e=>[e.dataset.print,e.checked])) });
          const response = await api('/settings',{method:'POST',body:JSON.stringify({taxSettings:next})});
          config=BillTaxes.normalize(response.settings?.taxSettings || next);
          try { await onSaved(response.settings || {taxSettings:config}); } catch (_) {}
          message='Saved. Checked taxes will appear on every new bill.'; draw();
        } catch(e) { status.textContent=e.message; if(button) button.disabled=false; }
      };
      root.querySelector('#rs-table-form').onsubmit = async event => {
        event.preventDefault(); const button=event.submitter; if(button)button.disabled=true;
        try { await api('/dine-in/tables',{method:'POST',body:JSON.stringify({tableId:root.querySelector('#rs-id').value||undefined,name:root.querySelector('#rs-name').value,zone:root.querySelector('#rs-zone').value,seats:Number(root.querySelector('#rs-seats').value),active:root.querySelector('#rs-active').checked})}); await load(); root.querySelector('#rs-table-status').textContent='Table saved.'; }
        catch(e) {root.querySelector('#rs-table-status').textContent=e.message;} finally {if(button)button.disabled=false;}
      };
      root.querySelector('#rs-clear').onclick=()=>root.querySelector('#rs-table-form').reset();
      root.querySelectorAll('[data-edit-table]').forEach(button=>button.onclick=()=>{const t=tables.find(t=>t.tableId===button.dataset.editTable);for(const [key,val] of Object.entries({id:t.tableId,name:t.name,zone:t.zone,seats:t.seats}))root.querySelector('#rs-'+key).value=val;root.querySelector('#rs-active').checked=t.active;root.querySelector('#rs-name').focus();});
    }
    async function load(){
      try {
        const access=await api('/dine-in'); tables=access.tables||[];
        // Loading tables must not reset edits in the independent tax form.
        const section=document.createElement('div');
        section.innerHTML=tables.map(t=>`<button type="button" data-edit-table="${esc(t.tableId)}"><b>Table ${esc(t.name)}</b><span>${esc(t.zone)} &middot; ${t.seats} seats &middot; ${esc(t.status)}</span></button>`).join('');
        root.querySelector('.rs-tables').replaceChildren(...section.childNodes);
        root.querySelectorAll('[data-edit-table]').forEach(button=>button.onclick=()=>{const t=tables.find(t=>t.tableId===button.dataset.editTable);for(const [key,val] of Object.entries({id:t.tableId,name:t.name,zone:t.zone,seats:t.seats}))root.querySelector('#rs-'+key).value=val;root.querySelector('#rs-active').checked=t.active;root.querySelector('#rs-name').focus();});
      } catch(e) {root.querySelector('#rs-table-status').textContent=e.message;}
    }
    draw();load();
  }
  return { mount };
})();
