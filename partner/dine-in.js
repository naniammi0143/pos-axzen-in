/* Shared POS/admin Dine In workspace. All authority and prices come from the API. */
window.DineIn = (() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => `₹${Number(v || 0).toFixed(2)}`;
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let dispose = () => {};
  let back = () => false;
  function mount(root, options) {
    dispose();
    let refreshing = false, floorFilter = "all", category = "All", search = "", zoneFilter = "all";
    let stopped = false, busy = false, access = null, selected = "", mode = options.mode || "tables", menu = [], bills = [], draft = [], requestId = id(), message = "", error = false;
    let draftRevision = null, pendingSend = false, panel = "order", addingTable = false, fieldValues = {}, fieldScope = null, cartExpanded = false, restoring = false;
    const api = (path, body, admin = false) => (admin ? options.adminApi || options.api : options.api)(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), timeoutMs: 15000 });
    const active = () => !stopped && root.isConnected && (!options.isActive || options.isActive());
    function stash() {
      if (!selected || !options.saveDraft) return;
      root.querySelectorAll('.di-dialog input,.di-dialog select').forEach(input=>{if(input.id)fieldValues[input.id]=input.value;});
      options.saveDraft(selected,{draft,requestId,draftRevision,fields:fieldValues});
    }
    back = () => {
      if (!active()) return false;
      if (busy || pendingSend) { message = "Please wait for the current order to finish."; render(); return true; }
      if (addingTable) { addingTable = false; render(); return true; }
      if (selected || mode !== "tables") {
        stash();
        selected = ""; mode = "tables"; draft = []; requestId = id(); draftRevision = null; render(); return true;
      }
      return false;
    };
    const table = () => access?.tables.find(t => t.tableId === selected);
    const summary = row => {
      const items = (row?.session?.tickets || []).filter(t => t.status !== "cancelled").flatMap(t => t.items);
      const subtotal=items.reduce((sum, i) => sum + i.qty * i.price, 0);
      return {items,...(window.BillTaxes ? BillTaxes.calculate(subtotal,0,access?.taxSettings || options.getSettings?.()?.taxSettings) : {subtotal,discount:0,total:subtotal,taxes:[],charges:[]})};
    };
    const button = (action, label, value = "", cls = "") => `<button type="button" class="di-btn ${cls}" data-di="${action}" data-value="${esc(value)}">${esc(label)}</button>`;
    const ticketHtml = (row, ticket) => `<article class="di-ticket"><div class="di-row"><strong>Table ${esc(row.name)} · KOT ${ticket.number}</strong><span class="di-pill">${esc(ticket.status)}</span></div><small>${esc(new Date(ticket.createdAt).toLocaleString())} · ${esc(ticket.waiter)}</small>${ticket.items.map(i => `<p><b>${i.qty} × ${esc(i.name)}</b>${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</p>`).join("")}<div class="di-row">${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status] ? button("ticket", `Mark ${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status]}`, `${row.tableId}|${ticket.id}|${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status]}`) : ""}${button("print-kot", "Reprint KOT", `${row.tableId}|${ticket.id}`, "soft")}${options.admin && !["served", "cancelled"].includes(ticket.status) ? button("cancel", "Cancel ticket", `${row.tableId}|${ticket.id}`, "soft") : ""}</div>${ticket.reason ? `<p>Cancelled: ${esc(ticket.reason)}</p>` : ""}</article>`;
    function floorTables() {
      return (access?.tables || []).filter(t => t.active || options.admin);
    }
    const tableState = status => ({
      available: { label: "Vacant", hint: "Start order" },
      occupied: { label: "Running", hint: "View order" },
      reserved: { label: "Reserved", hint: "Open table" },
      cleaning: { label: "To clean", hint: "Mark ready" },
      closing: { label: "Bill printed", hint: "Recover bill" },
      disabled: { label: "Disabled", hint: "Unavailable" }
    }[status] || { label: status || "Unknown", hint: "View table" });
    function elapsedTime(value) {
      const started = new Date(value).getTime();
      if (!Number.isFinite(started)) return "";
      const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
      if (minutes < 60) return `${minutes}m`;
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    function tableButton(t) {
      const open = summary(t);
      const state = tableState(t.status);
      const qty = open.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
      const kot = (t.session?.tickets || []).filter(ticket => !["served", "cancelled"].includes(ticket.status)).length;
      const age = elapsedTime(t.session?.openedAt);
      return `<button class="di-table ${esc(t.status)}${t.tableId === selected ? " is-selected" : ""}" data-di="select" data-value="${esc(t.tableId)}" aria-pressed="${t.tableId === selected}" aria-label="Table ${esc(t.name)}, ${esc(state.label)}"><span class="di-table-top"><span class="di-table-number">${esc(t.name)}</span><b class="di-table-status"><i aria-hidden="true"></i>${esc(state.label)}</b></span><span class="di-table-info"><span class="di-table-capacity">${t.seats} seats${t.session?.guests ? ` · ${t.session.guests} guests` : ""}</span>${open.total ? `<strong>${money(open.total)}</strong>` : `<strong class="di-table-hint">${esc(state.hint)}</strong>`}<span class="di-table-foot">${qty ? `${qty} items` : t.reservation ? esc(t.reservation) : esc(t.zone || "Floor")}${kot || age ? `<em>${kot ? `${kot} KOT` : ""}${kot && age ? " · " : ""}${esc(age)}</em>` : ""}</span></span></button>`;
    }
    function foodHtml() {
      return menu.filter(p => (category === "All" || (p.category || "Other") === category) && p.name.toLowerCase().includes(search.toLowerCase())).map(p => {
        const image = /^(https?:|data:image\/|\.?\.?\/|assets\/)/i.test(p.image || "") ? p.image : "";
        const qty = draft.filter(i => i.id === p.id && i.optionName === (p.optionName || "")).reduce((n, i) => n + i.qty, 0);
        return `<article class="di-food ${qty ? 'selected' : ''}"><button type="button" class="di-food-select" data-di="quick-add" data-value="${esc(p.choiceId)}" aria-label="Add ${esc(p.name)}" aria-pressed="${qty > 0}"><span class="di-food-photo">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : `<span class="di-food-placeholder" aria-hidden="true">♨</span>`}</span><span class="di-food-info"><h3>${esc(p.name)}</h3><strong>${money(p.price)}</strong></span></button>${qty ? `<span class="di-food-count" aria-label="${qty} in current order">${qty}</span><button type="button" class="di-food-remove" data-di="quick-remove" data-value="${esc(p.choiceId)}" aria-label="Remove ${esc(p.name)} from current order">×</button>` : ""}</article>`;
      }).join("") || '<p class="di-no-food">No dishes found. Try another category or search.</p>';
    }
    function orderHtml(row, total) {
      const subtotal = draft.reduce((s, i) => s + i.price * i.qty, 0);
      const draftBill = window.BillTaxes ? BillTaxes.calculate(subtotal,0,access?.taxSettings || options.getSettings?.()?.taxSettings) : {total:subtotal,taxes:[],charges:[]};
      const amount = draftBill.total;
      const discount = Math.min(total.subtotal, Math.max(0, Number(fieldValues['di-discount'] || 0)));
      const bill = window.BillTaxes ? BillTaxes.calculate(total.subtotal, discount, access?.taxSettings || options.getSettings?.()?.taxSettings) : total;
      return `<div class="di-layout"><section class="di-card di-menu-card"><h3>Add food</h3><label class="di-search"><span aria-hidden="true">⌕</span><input id="di-search" type="search" placeholder="Search dishes…" aria-label="Search dishes" value="${esc(search)}"></label><div class="di-categories">${["All", ...new Set(menu.map(p => p.category || "Other"))].map(c => button("category", c, c, c === category ? "" : "soft")).join("")}</div><div class="di-food-grid">${foodHtml()}</div><details class="di-manual"><summary>Item options & quantity</summary><label>Item<select id="di-product">${menu.map(p => `<option value="${esc(p.choiceId)}">${esc(p.name)} · ${money(p.price)}</option>`).join("")}</select></label><label>Quantity<input id="di-qty" type="number" min="1" max="999" step="1" value="1"></label>${button("add", "Add item")}</details></section><section class="di-card di-check-card"><div class="di-new-order"><button class="di-cart-heading" data-di="cart-toggle" aria-expanded="${cartExpanded}"><span><b>Current Order</b><small>Table ${esc(row.name)} · ${draft.length} items · ${draft.reduce((n,i)=>n+i.qty,0)} qty</small></span><strong>${money(amount)} &nbsp;⌃</strong></button><div class="di-cart-body"><div class="di-draft">${draft.map((i, n) => { const product=menu.find(p=>p.id===i.id && (p.optionName||'')===i.optionName); const photo=/^(https?:|data:image\/|\.?\.?\/|assets\/)/i.test(product?.image||'') ? product.image : ''; return `<div class="di-draft-line"><span class="di-order-index">${n+1}</span><span class="di-order-thumb">${photo ? `<img src="${esc(photo)}" alt="">` : esc(i.name.slice(0,2))}</span><div class="di-order-name"><b>${esc(i.name)}</b><small>${money(i.price)} each</small></div><div class="di-order-actions"><div class="di-stepper">${button("decrement", "−", n, "soft")}<b>${i.qty}</b>${button("increment", "+", n, "soft")}</div><strong>${money(i.qty * i.price)}</strong><button class="di-btn di-remove" data-di="remove" data-value="${n}" aria-label="Remove ${esc(i.name)}">×</button></div></div>`; }).join("")}</div>${!draft.length ? '<p class="di-empty-order">Choose dishes to start your order.</p>' : ""}<div class="di-order-fields"><label>Guests<input id="di-guests" type="number" min="1" max="${row.seats}" value="${row.session?.guests || 1}" ${row.session ? "disabled" : ""}></label><label>Kitchen note<input id="di-note" maxlength="200" placeholder="Less spicy, no onion…"></label></div></div><div class="di-order-summary"><p class="di-bill-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></p>${[...draftBill.charges,...draftBill.taxes].map(t=>`<p class="di-bill-line"><span>${esc(t.name)} (${t.rate}%)</span><strong>${money(t.amount)}</strong></p>`).join('')}</div><div class="di-total"><span>Total</span><strong>${money(amount)}</strong></div>${button("send", "Send to kitchen · " + money(amount))}<p class="di-send-hint">New items only · Saved separately for every table</p></div><div class="di-current-bill"><h3>Current bill</h3>${(row.session?.tickets || []).filter(t => t.status !== "cancelled").map(t => `<article class="di-bill-ticket"><div class="di-row"><strong>#${String(t.number).padStart(3, "0")}</strong><span class="di-pill">${esc(t.status)}</span></div><small>Sent ${esc(new Date(t.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}))}</small>${t.items.map(i => `<p class="di-bill-line"><span>${i.qty} × ${esc(i.name)}</span><strong>${money(i.qty * i.price)}</strong></p>`).join("")}${t.status === "ready" ? button("ticket", "✓ Mark served", row.tableId + "|" + t.id + "|served", "soft") : ""}</article>`).join("") || '<p class="di-empty-order">No items ordered yet</p>'}<div class="di-bill-summary"><p class="di-bill-line"><span>Subtotal</span><span>${money(bill.subtotal)}</span></p><p class="di-bill-line"><span>Discount</span><span>− ${money(bill.discount)}</span></p>${[...(bill.charges||[]),...(bill.taxes||[])].map(t=>`<p class="di-bill-line"><span>${esc(t.name)} (${t.rate}%)</span><span>${money(t.amount)}</span></p>`).join('')}<div class="di-total"><b>Total</b><strong>${money(bill.total)}</strong></div></div>${total.items.length ? `<label>Payment method<select id="di-payment"><option>Cash</option><option value="Online">UPI / Online</option><option>Card</option><option>Split</option></select></label><label class="di-split" hidden>Cash portion (Split only)<input id="di-cash" type="number" min="0" step="0.01" value="0"></label>${options.admin ? '<label>Discount<input id="di-discount" type="number" min="0" step="0.01" value="0"></label>' : ""}${button("settle", "Collect payment · " + money(bill.total))}` : row.session && options.admin ? button("close-empty", "Close cancelled table") : ""}</div></section></div>`;
    }
    function render() {
      if (!active()) return;
      const scope = addingTable ? "new-table" : selected;
      if (fieldScope !== scope) { if(!restoring)fieldValues = {}; fieldScope = scope; }
      else if(!restoring) root.querySelectorAll(".di-dialog input, .di-dialog select").forEach(input => { if (input.id) fieldValues[input.id] = input.value; });
      restoring=false;
      const row = table();
      let html = "";
      let service = "";
      if (!access) html = `<section class="di-empty"><h2>Connecting to restaurant…</h2></section>`;
      else if (!access.enabled) html = `<section class="di-empty"><h2>Please contact sales team</h2><p>Dine In is OFF for this restaurant.</p><p>Unlock table service, kitchen tickets and table-wise bills.</p><p>Contact sales to activate table service: <a href="tel:8790568446">8790568446</a></p><p>Upgrade Plan / activation requires manager approval.</p>${button("request", access.requested ? "Approval requested — check again" : "Request Dine In approval")}</section>`;
      else if (mode === "kitchen") {
        const pending = access.tables.flatMap(t => (t.session?.tickets || []).filter(k => !["served", "cancelled"].includes(k.status)).map(k => ({ table: t, ticket: k })));
        html = pending.length ? `<div class="di-board-head"><h2>Kitchen</h2><p>New → Preparing → Ready → Served. Updates every 5 seconds.</p></div><div class="di-kanban">${[["new", "New"], ["preparing", "Preparing"], ["ready", "Ready"]].map(([status, label]) => {
          const cards = pending.filter(item => item.ticket.status === status);
          return `<section class="di-lane"><header><h2>${label}</h2><span>${cards.length}</span></header>${cards.map(item => ticketHtml(item.table, item.ticket)).join("") || "<p class=\"di-lane-empty\">Clear</p>"}</section>`;
        }).join("")}</div>` : `<section class="di-empty"><h2>No pending kitchen tickets</h2><p>New orders appear here as soon as they are sent.</p></section>`;
      } else if (mode === "reports") {
        const dineBills = bills.filter(b => b.orderType === "Dine In");
        const groups = new Map();
        dineBills.forEach(b => { const g = groups.get(b.tableId) || { name: b.tableName, count: 0, total: 0 }; g.count++; g.total += Number(b.total); groups.set(b.tableId, g); });
        html = `<div class="di-board-head"><h2>Table-wise bills</h2><p>Saved bills · ${dineBills.length} bills · ${money(dineBills.reduce((s, b) => s + Number(b.total), 0))}</p></div><div class="di-grid">${[...groups.values()].map(g => `<div class="di-card"><h3>Table ${esc(g.name)}</h3><p>${g.count} bills · ${money(g.total)}</p></div>`).join("")}</div><div class="di-scroll"><table><thead><tr><th>Date</th><th>Table</th><th>Bill</th><th>Payment</th><th>Total</th><th>Receipt</th></tr></thead><tbody>${dineBills.slice().reverse().map(b => `<tr><td>${esc(b.time)}</td><td>${esc(b.tableName)}</td><td>${esc(b.id)}</td><td>${esc(b.payment)}</td><td>${money(b.total)}</td><td>${button("print-bill", "Print", b.clientOrderId)}</td></tr>`).join("") || '<tr><td colspan="6">No settled Dine In bills</td></tr>'}</tbody></table></div>`;
      } else {
        const tables = floorTables().filter(t => (floorFilter === "all" || t.status === floorFilter) && (zoneFilter === "all" || (t.zone || "Floor") === zoneFilter));
        const zones = [...new Set(floorTables().map(t => t.zone || "Floor"))];
        const groups = new Map();
        tables.forEach(t => { const zone = t.zone || "Floor"; if (!groups.has(zone)) groups.set(zone, []); groups.get(zone).push(t); });
        html = `<div class="di-board-head"><div><span class="di-floor-kicker">RESTAURANT FLOOR</span><h2>Table View</h2><p>${floorTables().length} tables · ${floorTables().filter(t => t.status === "occupied").length} running · ${floorTables().filter(t => t.status === "available").length} vacant</p></div>${options.manageTables ? button("new-table", "+ Add table") : ""}</div><div class="di-floor-toolbar"><div class="di-zone-tabs" aria-label="Select floor"><button type="button" data-di="zone" data-value="all" aria-pressed="${zoneFilter === "all"}">All Areas</button>${zones.map(z => `<button type="button" data-di="zone" data-value="${esc(z)}" aria-pressed="${zoneFilter === z}">${esc(z)}</button>`).join("")}</div><label class="di-floor-select">Floor<select id="di-floor"><option value="all">All areas</option>${zones.map(z => `<option value="${esc(z)}" ${zoneFilter === z ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label><div class="di-floor-filters" aria-label="Filter tables">${["all", "available", "occupied", "reserved", "cleaning"].map(status => { const state = tableState(status); return `<button type="button" data-di="filter" data-value="${status}" aria-pressed="${floorFilter === status}"><i class="${status}" aria-hidden="true"></i>${status === "all" ? "All" : esc(state.label)}<b>${floorTables().filter(t => status === "all" || t.status === status).length}</b></button>`; }).join("")}</div></div><div class="di-legend"><span class="available">Vacant</span><span class="occupied">Running</span><span class="reserved">Reserved</span><span class="cleaning">To clean</span><span class="closing">Bill printed</span></div>${[...groups.entries()].map(([zone, rows]) => `<section class="di-zone"><h2><span>${esc(zone)}</span><b>${rows.length} tables</b></h2><div class="di-grid">${rows.map(tableButton).join("")}</div></section>`).join("") || `<div class="di-no-tables"><strong>No tables found</strong><span>Choose another area or status.</span></div>`}`;
        if (row || addingTable) {
          let panelHtml = "";
          if (addingTable) panelHtml = `${tableForm()}${button("save-table", "Create table")}`;
          else {
            const total = summary(row);
            panelHtml = `<p class="di-meta">${esc(row.zone)} · ${row.seats} seats ${row.reservation ? `· ${esc(row.reservation)}` : ""}</p>`;
            if (["available", "reserved", "occupied"].includes(row.status) && row.active) {
              panelHtml += orderHtml(row, total);
            }
            if (row.status === "available") panelHtml += button("reserve", "Reserve table", "", "soft");
            if (["reserved", "cleaning"].includes(row.status)) panelHtml += button("available", row.status === "cleaning" ? "Mark cleaned / available" : "Release reservation");
            if (row.status === "closing") panelHtml += `<p>Bill is being saved. Retry safely with the same bill ID.</p>${button("settle", "Recover bill")}`;
            if (row.lastBill?.clientOrderId) panelHtml += button("last-bill", "Reprint last bill", "", "soft");
            if (options.manageTables && ["available", "disabled"].includes(row.status)) panelHtml += `<section class="di-settings-panel"><h3>Table settings</h3>${tableForm(row)}${button("save-table", "Save table")}${button("disable", row.active ? "Disable table" : "Enable table", "", "soft")}</section>`;
            panelHtml += `<section class="di-tickets-panel"><h3>Kitchen tickets</h3><div class="di-grid">${(row.session?.tickets || []).map(t => ticketHtml(row, t)).join("") || "No kitchen tickets yet"}</div></section>`;
          }
          const syncState=options.syncStatus?.();
          const syncText=syncState ? syncState.error || (syncState.pending ? `${syncState.pending} changes waiting to sync` : syncState.offline ? 'Offline · saved on this device' : 'All table changes synced') : '';
          const title = addingTable ? "Add a table" : `Table ${esc(row.name)}`;
          const tabs = row ? `<div class="di-panel-tabs">${["order", "bill", "tickets", ...(options.manageTables ? ["settings"] : [])].map(key => `<button class="di-btn ${panel === key ? "" : "soft"}" data-di="panel" data-value="${key}" aria-pressed="${panel === key}">${{ order: "Add food", bill: "Current bill", tickets: "Kitchen tickets", settings: "Table settings" }[key]}</button>`).join("")}</div>` : "";
          service = `<dialog class="di-dialog${cartExpanded ? " di-cart-expanded" : ""}" open aria-label="${title}"><div class="di-dialog-head"><div><small>${addingTable ? "FLOOR SETUP" : esc(row.status)}</small><h2>${title}</h2><p class="di-sync-banner" role="status">${esc(syncText)}</p>${message ? `<p class="di-feedback ${error ? 'error' : ''}" role="${error ? 'alert' : 'status'}">${esc(message)}</p>` : ''}</div>${button("close-popup", "Close", "", "soft")}</div>${tabs}<div class="di-dialog-content" data-panel="${panel}">${panelHtml}</div></dialog>`;
        }
      }
      const tables = floorTables();
      const openCount = tables.filter(t => t.status === "occupied").length;
      const freeCount = tables.filter(t => t.status === "available").length;
      const kitchenCount = tables.reduce((count, t) => count + (t.session?.tickets || []).filter(k => !["served", "cancelled"].includes(k.status)).length, 0);
      root.innerHTML = `<div class="di di-mode-${esc(mode)}${service ? " di-has-service" : ""}"><header><div class="di-brand"><span class="di-eyebrow">RESTAURANT FLOOR</span><h1>Dine In</h1></div><div class="di-stats"><span><b>${openCount}</b> occupied</span><span><b>${freeCount}</b> free</span><span><b>${kitchenCount}</b> in kitchen</span></div><nav>${button("tables", "Tables", "", mode === "tables" ? "" : "soft")}${button("kitchen", "Kitchen", "", mode === "kitchen" ? "" : "soft")}${button("reports", "Bills", "", mode === "reports" ? "" : "soft")}${button("refresh", "Refresh", "", "soft")}</nav></header><div class="di-main"><p role="status" class="di-message ${error ? "error" : ""}">${esc(message)}</p>${html}</div>${service}</div>`;
      const dialog = root.querySelector(".di-dialog");
      const split = root.querySelector(".di-split"); if (split) split.hidden = fieldValues["di-payment"] !== "Split";
      root.querySelectorAll(".di-dialog input, .di-dialog select").forEach(input => { if (Object.hasOwn(fieldValues, input.id)) input.value = fieldValues[input.id]; });
      if (dialog) dialog.addEventListener("cancel", event => { event.preventDefault(); back(); });
      root.querySelectorAll("button").forEach(b => b.disabled = busy);
      stash();
      const sync=options.syncStatus?.(); if(sync) { const statusNode=root.querySelector(".di-message"); if(statusNode && !message) statusNode.textContent=sync.error || (sync.pending ? `${sync.pending} changes saved · waiting to sync` : sync.offline ? "Offline · using saved restaurant data" : ""); }
    }
    function tableForm(t = {}) { return `<div class="di-row"><label>Table number / name<input id="di-name" maxlength="40" value="${esc(t.name)}"></label><label>Area / floor<input id="di-zone" maxlength="40" value="${esc(t.zone || "Main Hall")}"></label><label>Seats<input id="di-seats" type="number" min="1" max="100" value="${t.seats || 4}"></label></div>`; }
    async function refresh(draw = true) {
      const next = await api("/dine-in");
      if (!active()) return;
      access = next;
      if (!access.enabled) { draft = []; requestId = id(); }
      if (draw) render();
      if (access.enabled && !menu.length) menu = (await options.getMenu()).filter(p => p.billingType !== "weight" && !p.hidden).flatMap(p => [p, ...(p.subItems || []).map(o => ({ ...p, name: `${p.name} (${o.name})`, price: o.price, optionName: o.name }))]).map((p, index) => ({ ...p, choiceId: String(index) }));
      const acknowledged = selected && table()?.session?.tickets.some(t => t.id === requestId);
      if (pendingSend && acknowledged) { pendingSend = false; draft = []; requestId = id(); draftRevision = null; message = "Kitchen order was saved. Use Reprint KOT if you did not receive a print."; }
      if (mode === "reports") bills = await api("/orders");
      if (draw) render();
    }
    function printKot(t, k, copy) {
      if (!options.printKot) { message = "Ticket saved in Kitchen. Printing is available in the POS APK."; return; }
      const result = options.printKot(t, k, copy);
      message = `Kitchen ticket saved. ${result || "Print requested — verify printer output."}`;
    }
    const val = id => root.querySelector(`#di-${id}`)?.value;
    async function click(event) {
      const btn = event.target.closest("[data-di]");
      if (!btn || busy) return;
      const action = btn.dataset.di, value = btn.dataset.value, row = table();
      if (action === "cart-toggle") { cartExpanded=!cartExpanded;render();return; }
      if (action === "close-popup") { back(); return; }
      if (action === "category") { category = value; render(); return; }
      if (action === "filter") { floorFilter = value; render(); return; }
      if (action === "zone") { zoneFilter = value; render(); return; }
      if (action === "panel") { panel = value; render(); return; }
      if (action === "new-table") { addingTable = true; render(); return; }
      busy = true; error = false; message = "";
      root.querySelectorAll("button").forEach(b => b.disabled = true);
      try {
        if (pendingSend && !["send", "refresh"].includes(action)) throw new Error("Previous order confirmation is pending. Refresh or retry Send before changing items.");
        if (["tables", "kitchen", "reports"].includes(action)) { stash(); draft = []; draftRevision = null; requestId = id(); mode = action; selected = ""; addingTable = false; }
        if (action === "select") {
          if (selected === value) return;
          stash(); selected = value; panel = "order";
          const saved=options.getDraft?.(selected); draft=saved?.draft||[]; requestId=saved?.requestId||id(); draftRevision=saved?.draftRevision??null; fieldValues=saved?.fields||{}; restoring=true;
        }
        if (action === "back") { stash(); selected = ""; draft = []; requestId = id(); draftRevision = null; }
        if (action === "request") { await api("/dine-in/request", {}); message = "Approval requested. Contact your account manager."; }
        if (action === "quick-remove") { const product=menu.find(p=>p.choiceId===value); if(product) draft=draft.filter(i=>!(i.id===product.id && i.optionName===(product.optionName||"")));requestId=id(); }
        if (["quick-add", "increment", "decrement"].includes(action)) {
          if (!row || !row.active || !["available", "reserved", "occupied"].includes(row.status)) throw new Error("Select an available table first");
          if (!draft.length) draftRevision = row.revision;
          if (action === "quick-add") {
            const product = menu.find(p => p.choiceId === value);
            if (!product) throw new Error("Dish is no longer available");
            const note = val("note") || "";
            const existing = draft.find(i => i.id === product.id && i.optionName === (product.optionName || "") && i.note === note);
            if (existing) { if (existing.qty >= 999) throw new Error("Maximum quantity is 999"); existing.qty++; }
            else draft.push({id:product.id, optionName:product.optionName || "", name:product.name, price:product.price, qty:1, note});
          } else {
            const item = draft[Number(value)];
            if (!item) throw new Error("Item is no longer in this order");
            if (action === "increment" && item.qty >= 999) throw new Error("Maximum quantity is 999");
            item.qty += action === "increment" ? 1 : -1;
            if (!item.qty) draft.splice(Number(value), 1);
          }
          requestId = id();
        }
        if (action === "add") {
          const product = menu.find(p => p.choiceId === val("product")); const qty = Number(val("qty"));
          if (!product || !Number.isInteger(qty) || qty < 1 || qty > 999) throw new Error("Select an item and whole quantity 1–999");
          if (!draft.length) draftRevision = row.revision;
          draft.push({ id: product.id, optionName: product.optionName || "", name: product.name, price: product.price, qty, note: val("note") }); requestId = id();
        }
        if (action === "remove") { draft.splice(Number(value), 1); requestId = id(); }
        if (action === "send") {
          if (!draft.length) throw new Error("Add food before sending");
          const guests = Number(val("guests") || 1);
          pendingSend = true;
          const result = await api(`/dine-in/tables/${selected}/tickets`, { requestId, revision: draftRevision, guests, items: draft.map(item => ({ ...item, note: item.note || val("note") || "" })) });
          pendingSend = false; draft = []; requestId = id(); draftRevision = null;
          message = "Order saved. Visible in Kitchen.";
          if (!result.duplicate) { try { printKot(result.table, result.ticket, false); } catch (e) { message = `Order saved. Printer failed: ${e.message}. Use Reprint KOT.`; } }
        }
        if (action === "save-table" || action === "disable") await api("/dine-in/tables", { tableId: row?.tableId, name: val("name"), zone: val("zone"), seats: Number(val("seats")), active: action === "disable" ? !row.active : row?.active !== false }, true);
        if (action === "reserve" || action === "available") {
          const reservation = action === "reserve" ? prompt("Reservation name / time") : "";
          if (reservation === null) return;
          await api(`/dine-in/tables/${selected}/state`, { status: action === "reserve" ? "reserved" : "available", reservation });
        }
        if (action === "ticket" || action === "cancel") {
          const [tid, kid, status] = value.split("|"); const reason = action === "cancel" ? prompt("Reason for cancellation") : "";
          if (reason === null) return;
          await api(`/dine-in/tables/${tid}/tickets/${kid}`, { status: action === "cancel" ? "cancelled" : status, reason });
        }
        if (action === "settle") {
          if (draft.length) throw new Error("Send or remove unsent items before payment");
          if (row.status !== "closing" && !confirm(`Confirm payment of ${money(window.BillTaxes ? BillTaxes.calculate(summary(row).subtotal, Number(val("discount") || 0), access?.taxSettings || options.getSettings?.()?.taxSettings).total : summary(row).total - Number(val("discount") || 0))}?`)) return;
          const result = await api(`/dine-in/tables/${selected}/settle`, { sessionId: row.session.id, revision: row.revision, payment: val("payment"), cash: Number(val("cash") || 0), discount: Number(val("discount") || 0) });
          message = "Bill saved. Table is awaiting cleaning.";
          try { if (options.printBill && !result.duplicate) options.printBill(result.order); } catch (e) { message += ` Printer failed: ${e.message}. Reprint last bill.`; }
        }
        if (action === "close-empty") await api(`/dine-in/tables/${selected}/close-empty`, {}, true);
        if (action === "print-kot") { const [tid, kid] = value.split("|"); const t = access.tables.find(t => t.tableId === tid); printKot(t, t.session.tickets.find(k => k.id === kid), true); }
        if (action === "last-bill" || action === "print-bill") {
          if (!options.printBill) throw new Error("Open this bill in POS APK to print");
          options.printBill(action === "last-bill" ? row.lastBill : bills.find(b => b.clientOrderId === value)); message = "Reprint requested. Verify printer output.";
        }
        if (action === "save-table") addingTable = false;
        if (!["quick-remove", "quick-add", "increment", "decrement", "select", "back", "add", "remove", "tables", "kitchen", "print-kot", "last-bill", "print-bill"].includes(action)) await refresh(false);
      } catch (e) {
        if (e.status >= 400 && e.status < 500) pendingSend = false;
        message = e.message; error = true;
        // Keep the request ID after timeouts so retry cannot duplicate the KOT.
        try { await refresh(false); } catch (_) {}
        if (e.status === 409 && draft.length) { draftRevision = table()?.revision; message += " Review the updated table, then retry."; }
      } finally { busy = false; render(); }
    }
    const input = event => {
      if (event.target.id === "di-search") { search = event.target.value; root.querySelector(".di-food-grid").innerHTML = foodHtml(); }
      if (event.target.id === "di-floor") { zoneFilter = event.target.value; render(); }
      if (event.target.id === "di-discount") { fieldValues["di-discount"]=event.target.value; }
      if (event.target.id === "di-payment") { const split = root.querySelector(".di-split"); if (split) split.hidden = event.target.value !== "Split"; }
      if(event.target.id?.startsWith('di-')) stash();
    };
    const change = event => { if(event.target.id === "di-discount") render(); };
    root.addEventListener("change", change);
    root.addEventListener("input", input);
    root.addEventListener("click", click);
    render(); refresh().catch(e => { message = e.message; error = true; render(); });
    const timer = setInterval(() => { if (!active()) return clearInterval(timer); if (!busy && !refreshing && !document.hidden && !selected && !addingTable && mode !== "reports") { refreshing = true; refresh().catch(e => { message = `Connection lost: ${e.message}. Refresh before ordering.`; error = true; render(); }).finally(() => { refreshing = false; }); } }, 5000);
    dispose = () => { stash(); stopped = true; clearInterval(timer); root.removeEventListener("click", click); root.removeEventListener("input", input); root.removeEventListener("change", change); };
    return dispose;
  }
  return { mount, close: () => dispose(), back: () => back() };
})();
