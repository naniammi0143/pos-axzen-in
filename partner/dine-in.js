/* Shared POS/admin Dine In workspace. All authority and prices come from the API. */
window.DineIn = (() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => `₹${Number(v || 0).toFixed(2)}`;
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let dispose = () => {};
  let back = () => false;
  function mount(root, options) {
    dispose();
    let stopped = false, busy = false, access = null, selected = "", mode = options.mode || "tables", menu = [], bills = [], draft = [], requestId = id(), message = "", error = false;
    let draftRevision = null, pendingSend = false, panel = "order", addingTable = false, fieldValues = {}, fieldScope = null;
    const api = (path, body, admin = false) => (admin ? options.adminApi || options.api : options.api)(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), timeoutMs: 15000 });
    const active = () => !stopped && root.isConnected && (!options.isActive || options.isActive());
    back = () => {
      if (!active()) return false;
      if (busy || pendingSend) { message = "Please wait for the current order to finish."; render(); return true; }
      if (addingTable) { addingTable = false; render(); return true; }
      if (selected || mode !== "tables") {
        if (draft.length && !confirm("Discard unsent items and return to tables?")) return true;
        selected = ""; mode = "tables"; draft = []; requestId = id(); draftRevision = null; render(); return true;
      }
      return false;
    };
    const table = () => access?.tables.find(t => t.tableId === selected);
    const summary = row => {
      const items = (row?.session?.tickets || []).filter(t => t.status !== "cancelled").flatMap(t => t.items);
      return { items, total: items.reduce((sum, i) => sum + i.qty * i.price, 0) };
    };
    const button = (action, label, value = "", cls = "") => `<button type="button" class="di-btn ${cls}" data-di="${action}" data-value="${esc(value)}">${esc(label)}</button>`;
    const ticketHtml = (row, ticket) => `<article class="di-ticket"><div class="di-row"><strong>Table ${esc(row.name)} · KOT ${ticket.number}</strong><span class="di-pill">${esc(ticket.status)}</span></div><small>${esc(new Date(ticket.createdAt).toLocaleString())} · ${esc(ticket.waiter)}</small>${ticket.items.map(i => `<p><b>${i.qty} × ${esc(i.name)}</b>${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</p>`).join("")}<div class="di-row">${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status] ? button("ticket", `Mark ${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status]}`, `${row.tableId}|${ticket.id}|${{ new: "preparing", preparing: "ready", ready: "served" }[ticket.status]}`) : ""}${button("print-kot", "Reprint KOT", `${row.tableId}|${ticket.id}`, "soft")}${options.admin && !["served", "cancelled"].includes(ticket.status) ? button("cancel", "Cancel ticket", `${row.tableId}|${ticket.id}`, "soft") : ""}</div>${ticket.reason ? `<p>Cancelled: ${esc(ticket.reason)}</p>` : ""}</article>`;
    function floorTables() {
      return (access?.tables || []).filter(t => t.active || options.admin);
    }
    function tableButton(t) {
      const open = summary(t);
      return `<button class="di-table ${esc(t.status)}${t.tableId === selected ? " is-selected" : ""}" data-di="select" data-value="${esc(t.tableId)}" aria-pressed="${t.tableId === selected}"><span>Table</span><h2>${esc(t.name)}</h2><b>${esc(t.status)}</b><p>${t.seats} seats${t.session?.guests ? ` · ${t.session.guests} guests` : ""} · ${money(open.total)}${t.reservation ? ` · ${esc(t.reservation)}` : ""}</p></button>`;
    }
    function render() {
      if (!active()) return;
      const scope = addingTable ? "new-table" : selected;
      if (fieldScope !== scope) { fieldValues = {}; fieldScope = scope; }
      else root.querySelectorAll(".di-dialog input, .di-dialog select").forEach(input => { if (input.id) fieldValues[input.id] = input.value; });
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
        const tables = floorTables();
        const groups = new Map();
        tables.forEach(t => { const zone = t.zone || "Floor"; if (!groups.has(zone)) groups.set(zone, []); groups.get(zone).push(t); });
        html = `<div class="di-legend"><span class="available">Available</span><span class="reserved">Reserved</span><span class="occupied">Occupied</span><span class="cleaning">Cleaning</span><span class="disabled">Disabled</span></div>${[...groups.entries()].map(([zone, rows]) => `<section class="di-zone"><h2>${esc(zone)}</h2><div class="di-grid">${rows.map(tableButton).join("")}</div></section>`).join("") || "<p>No tables yet. Ask your restaurant admin to add tables.</p>"}${options.admin ? `<p class="di-add">${button("new-table", "+ Add table")}</p>` : ""}`;
        if (row || addingTable) {
          let panelHtml = "";
          if (addingTable) panelHtml = `${tableForm()}${button("save-table", "Create table")}`;
          else {
            const total = summary(row);
            panelHtml = `<p class="di-meta">${esc(row.zone)} · ${row.seats} seats ${row.reservation ? `· ${esc(row.reservation)}` : ""}</p>`;
            if (["available", "reserved", "occupied"].includes(row.status) && row.active) {
              panelHtml += `<div class="di-layout"><section class="di-card"><h3>Add food</h3><label>Item <select id="di-product">${menu.map(p => `<option value="${esc(p.choiceId)}">${esc(p.name)} · ${money(p.price)}</option>`).join("")}</select></label><div class="di-row"><label>Quantity<input id="di-qty" type="number" min="1" max="999" step="1" value="1"></label><label>Guests<input id="di-guests" type="number" min="1" max="${row.seats}" value="${row.session?.guests || 1}" ${row.session ? "disabled" : ""}></label></div><label>Kitchen note<input id="di-note" maxlength="200" placeholder="Less spicy, no onion…"></label>${button("add", "Add item")}<div class="di-draft">${draft.map((i, n) => `<p>${i.qty} × ${esc(i.name)} · ${money(i.qty * i.price)} ${button("remove", "Remove", n, "soft")}</p>`).join("")}</div><strong>New order: ${money(draft.reduce((s, i) => s + i.price * i.qty, 0))}</strong><p>${button("send", "Send order to kitchen")}</p><small>Only newly added items are sent. Sent orders remain on this table until payment.</small></section><section class="di-card"><h3>Open bill · ${money(total.total)}</h3>${total.items.map(i => `<p>${i.qty} × ${esc(i.name)} <strong>${money(i.qty * i.price)}</strong></p>`).join("") || "No items ordered yet"}${total.items.length ? `<label>Payment<select id="di-payment"><option>Cash</option><option>Online</option><option>Card</option><option>Split</option></select></label><label>Cash portion (Split only)<input id="di-cash" type="number" min="0" step="0.01" value="0"></label>${options.admin ? '<label>Discount<input id="di-discount" type="number" min="0" step="0.01" value="0"></label>' : ""}${button("settle", "Confirm payment & close bill")}` : row.session && options.admin ? button("close-empty", "Close cancelled table") : ""}</section></div>`;
            }
            if (row.status === "available") panelHtml += button("reserve", "Reserve table", "", "soft");
            if (["reserved", "cleaning"].includes(row.status)) panelHtml += button("available", row.status === "cleaning" ? "Mark cleaned / available" : "Release reservation");
            if (row.status === "closing") panelHtml += `<p>Bill is being saved. Retry safely with the same bill ID.</p>${button("settle", "Recover bill")}`;
            if (row.lastBill?.clientOrderId) panelHtml += button("last-bill", "Reprint last bill", "", "soft");
            if (options.admin && ["available", "disabled"].includes(row.status)) panelHtml += `<section class="di-settings-panel"><h3>Table settings</h3>${tableForm(row)}${button("save-table", "Save table")}${button("disable", row.active ? "Disable table" : "Enable table", "", "soft")}</section>`;
            panelHtml += `<section class="di-tickets-panel"><h3>Kitchen tickets</h3><div class="di-grid">${(row.session?.tickets || []).map(t => ticketHtml(row, t)).join("") || "No kitchen tickets yet"}</div></section>`;
          }
          const title = addingTable ? "Add a table" : `Table ${esc(row.name)}`;
          const tabs = row ? `<div class="di-panel-tabs">${["order", "bill", "tickets", ...(options.admin ? ["settings"] : [])].map(key => `<button class="di-btn ${panel === key ? "" : "soft"}" data-di="panel" data-value="${key}" aria-pressed="${panel === key}">${{ order: "Add food", bill: "Current bill", tickets: "Kitchen tickets", settings: "Table settings" }[key]}</button>`).join("")}</div>` : "";
          service = `<dialog class="di-dialog" open aria-label="${title}"><div class="di-dialog-head"><div><small>${addingTable ? "FLOOR SETUP" : esc(row.status)}</small><h2>${title}</h2></div>${button("close-popup", "Close", "", "soft")}</div>${tabs}<div class="di-dialog-content" data-panel="${panel}">${panelHtml}</div></dialog>`;
        }
      }
      const tables = floorTables();
      const openCount = tables.filter(t => t.status === "occupied").length;
      const freeCount = tables.filter(t => t.status === "available").length;
      const kitchenCount = tables.reduce((count, t) => count + (t.session?.tickets || []).filter(k => !["served", "cancelled"].includes(k.status)).length, 0);
      root.innerHTML = `<div class="di di-mode-${esc(mode)}${service ? " di-has-service" : ""}"><header><div class="di-brand"><span class="di-eyebrow">RESTAURANT FLOOR</span><h1>Dine In</h1></div><div class="di-stats"><span><b>${openCount}</b> occupied</span><span><b>${freeCount}</b> free</span><span><b>${kitchenCount}</b> in kitchen</span></div><nav>${button("tables", "Tables", "", mode === "tables" ? "" : "soft")}${button("kitchen", "Kitchen", "", mode === "kitchen" ? "" : "soft")}${button("reports", "Bills", "", mode === "reports" ? "" : "soft")}${button("refresh", "Refresh", "", "soft")}</nav></header><div class="di-main"><p role="status" class="di-message ${error ? "error" : ""}">${esc(message)}</p>${html}</div>${service}</div>`;
      const dialog = root.querySelector(".di-dialog");
      root.querySelectorAll(".di-dialog input, .di-dialog select").forEach(input => { if (Object.hasOwn(fieldValues, input.id)) input.value = fieldValues[input.id]; });
      if (dialog) dialog.addEventListener("cancel", event => { event.preventDefault(); back(); });
      root.querySelectorAll("button").forEach(b => b.disabled = busy);
    }
    function tableForm(t = {}) { return `<div class="di-row"><label>Table number / name<input id="di-name" maxlength="40" value="${esc(t.name)}"></label><label>Area / floor<input id="di-zone" maxlength="40" value="${esc(t.zone || "Main Hall")}"></label><label>Seats<input id="di-seats" type="number" min="1" max="100" value="${t.seats || 4}"></label></div>`; }
    async function refresh(draw = true) {
      const next = await api("/dine-in");
      if (!active()) return;
      access = next;
      if (!access.enabled) { draft = []; requestId = id(); }
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
      if (action === "close-popup") { back(); return; }
      if (action === "panel") { panel = value; render(); return; }
      if (action === "new-table") { addingTable = true; render(); return; }
      busy = true; error = false; message = "";
      root.querySelectorAll("button").forEach(b => b.disabled = true);
      try {
        if (pendingSend && !["send", "refresh"].includes(action)) throw new Error("Previous order confirmation is pending. Refresh or retry Send before changing items.");
        if (["tables", "kitchen", "reports"].includes(action)) { if (draft.length && !confirm("Discard unsent items?")) return; draft = []; draftRevision = null; requestId = id(); mode = action; selected = ""; addingTable = false; }
        if (action === "select") {
          if (draft.length && selected !== value && !confirm("Discard unsent items?")) return;
          selected = value; panel = "order"; draft = []; requestId = id(); draftRevision = null;
        }
        if (action === "back") { if (draft.length && !confirm("Discard unsent items?")) return; selected = ""; draft = []; requestId = id(); draftRevision = null; }
        if (action === "request") { await api("/dine-in/request", {}); message = "Approval requested. Contact your account manager."; }
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
          const result = await api(`/dine-in/tables/${selected}/tickets`, { requestId, revision: draftRevision, guests, items: draft });
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
          if (row.status !== "closing" && !confirm(`Confirm payment of ${money(summary(row).total - Number(val("discount") || 0))}?`)) return;
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
        await refresh(false);
      } catch (e) {
        if (e.status >= 400 && e.status < 500) pendingSend = false;
        message = e.message; error = true;
        // Keep the request ID after timeouts so retry cannot duplicate the KOT.
        try { await refresh(false); } catch (_) {}
        if (e.status === 409 && draft.length) { draftRevision = table()?.revision; message += " Review the updated table, then retry."; }
      } finally { busy = false; render(); }
    }
    root.addEventListener("click", click);
    render(); refresh().catch(e => { message = e.message; error = true; render(); });
    const timer = setInterval(() => { if (!active()) return clearInterval(timer); if (!busy && !selected && !addingTable && mode !== "reports") refresh().catch(e => { message = `Connection lost: ${e.message}. Refresh before ordering.`; error = true; render(); }); }, 5000);
    dispose = () => { stopped = true; clearInterval(timer); root.removeEventListener("click", click); };
    return dispose;
  }
  return { mount, close: () => dispose(), back: () => back() };
})();
