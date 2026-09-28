window.MarketingHelpCenter = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const ticketId = row => String(row._id || row.id || '');
  const day = value => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const clock = value => value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const bucket = status => {
    if (status === 'In Progress') return 'In Progress';
    if (status === 'Reopened') return 'Reopened';
    if (status === 'Closed') return 'Closed';
    if (status === 'Solved' || status === 'Resolved') return 'Resolved';
    return 'Open';
  };
  const priorityLabel = value => value === 'High' || value === 'Low' ? value : 'Medium';
  const numberOf = row => `T${String(row.id || String(row._id || '').slice(-4) || '0000').replace(/\D/g, '').slice(-4).padStart(4, '0')}`;
  let rows = [];
  let selectedId = '';
  let activeTab = '';

  function icon(name) {
    const paths = {
      headset: '<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 14v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z"/><path d="M20 14v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z"/><path d="M18 19a4 4 0 0 1-4 2h-2"/>',
      open: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/>',
      progress: '<path d="M12 3v3"/><path d="m16.5 7.5 2-2"/><path d="M21 12h-3"/><path d="m16.5 16.5 2 2"/><path d="M12 21v-3"/><path d="m7.5 16.5-2 2"/><path d="M3 12h3"/><path d="m7.5 7.5-2-2"/>',
      resolved: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.2 2.2 4.3-4.4"/>',
      reopened: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
      total: '<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.open}</svg>`;
  }

  function counts() {
    const tally = { Open: 0, 'In Progress': 0, Resolved: 0, Reopened: 0, Closed: 0 };
    rows.forEach(row => { tally[bucket(row.status)] += 1; });
    return tally;
  }

  function weekDelta(name) {
    const now = Date.now();
    const inWindow = (row, start, end) => {
      const time = new Date(row.createdAt || 0).getTime();
      return time >= start && time < end && (name === 'All' || bucket(row.status) === name);
    };
    const recent = rows.filter(row => inWindow(row, now - 7 * 86400000, now)).length;
    const previous = rows.filter(row => inWindow(row, now - 14 * 86400000, now - 7 * 86400000)).length;
    const diff = recent - previous;
    return `${diff >= 0 ? '+' : ''}${diff} vs last 7 days`;
  }

  function detail(row) {
    if (!row) return `<aside class="desk-detail" id="helpTicketDetail"><div class="help-empty">Select a ticket to see the request.</div></aside>`;
    const status = bucket(row.status);
    const priority = priorityLabel(row.priority);
    const comments = Array.isArray(row.comments) ? row.comments : [];
    const tags = Array.isArray(row.tags) ? row.tags : [];
    return `<aside class="desk-detail" id="helpTicketDetail">
      <header class="desk-detail-head">
        <div><p>Ticket details</p><h3>${esc(row.problemType || row.title || 'Help request')}</h3><strong>#${esc(numberOf(row))}</strong></div>
        <span class="tag status-${esc(status).toLowerCase().replace(' ', '-')}">${esc(status)}</span>
      </header>
      <div class="desk-meta">
        <div><span>Created</span><strong>${day(row.createdAt)}</strong><small>${clock(row.createdAt)}</small></div>
        <div><span>Updated</span><strong>${day(row.updatedAt || row.createdAt)}</strong><small>${clock(row.updatedAt || row.createdAt)}</small></div>
      </div>
      <div class="desk-chips">
        <span class="tag cat">${esc(row.problemType || 'General')}</span>
        <span class="tag pri-${esc(priority).toLowerCase()}">${esc(priority)}</span>
        ${row.assignedTo ? `<span class="tag">${esc(row.assignedTo)}</span>` : ''}
        ${tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
      </div>
      <section><h4>Description</h4><p>${esc(row.message || 'No details')}</p><p class="muted">${esc(row.canteenName || '-')} · ${esc(row.customerName || '-')} · ${esc(row.phone || '-')}</p></section>
      <section><h4>Comments</h4>${comments.map(item => `<article class="note"><strong>${esc(item.author || 'Support')}</strong><span>${day(item.createdAt)} ${clock(item.createdAt)}</span><p>${esc(item.text)}</p></article>`).join('') || '<p class="muted">No notes yet.</p>'}</section>
      <label class="note-box">Add a note<textarea id="helpNote" maxlength="500" placeholder="Type a message or update"></textarea></label>
      <div class="desk-actions">
        <button class="ghost" data-help-status="${esc(ticketId(row))}" data-next="Reopened" type="button">Reopen Ticket</button>
        <button class="primary" data-help-status="${esc(ticketId(row))}" data-next="Solved" type="button">Close Ticket</button>
        <button class="soft" data-add-note="${esc(ticketId(row))}" type="button">Add Note</button>
      </div>
      <div class="desk-more">
        <button type="button" data-assign="${esc(ticketId(row))}">Assign To</button>
        <button type="button" data-set-priority="${esc(ticketId(row))}">Change Priority</button>
        <button type="button" data-tag="${esc(ticketId(row))}">Add Tag</button>
        <button type="button" data-progress="${esc(ticketId(row))}">In Progress</button>
        <button type="button" data-print>Print</button>
      </div>
    </aside>`;
  }

  function rowHtml(row) {
    const status = bucket(row.status);
    const priority = priorityLabel(row.priority);
    const id = ticketId(row);
    return `<tr class="${id === selectedId ? 'is-selected' : ''}" data-help-card data-view="${esc(id)}" data-search="${esc(`${numberOf(row)} ${row.canteenName} ${row.customerName} ${row.phone} ${row.problemType} ${row.title} ${row.message}`.toLowerCase())}" data-status="${esc(status)}" data-type="${esc(row.problemType || '')}" data-priority="${esc(priority)}" data-created="${esc(String(row.createdAt || '').slice(0, 10))}">
      <td><input type="checkbox" data-check aria-label="Select ticket"></td>
      <td><strong>#${esc(numberOf(row))}</strong></td>
      <td class="subject"><strong>${esc(row.problemType || row.title || 'Help request')}</strong><small>${esc(row.canteenName || '-')} · ${esc(row.customerName || '-')}</small></td>
      <td><span class="tag cat">${esc(row.problemType || 'General')}</span></td>
      <td><span class="tag pri-${esc(priority).toLowerCase()}">${esc(priority)}</span></td>
      <td><span class="tag status-${esc(status).toLowerCase().replace(' ', '-')}">${esc(status)}</span></td>
      <td>${day(row.createdAt)}<small>${clock(row.createdAt)}</small></td>
      <td>${day(row.updatedAt || row.createdAt)}<small>${clock(row.updatedAt || row.createdAt)}</small></td>
      <td><button class="view" data-view="${esc(id)}" type="button">View</button></td>
    </tr>`;
  }

  function render(list) {
    rows = Array.isArray(list) ? list : [];
    if (!rows.some(row => ticketId(row) === selectedId)) selectedId = ticketId(rows[0] || {});
    const tally = counts();
    const types = [...new Set(rows.map(row => row.problemType).filter(Boolean))];
    const selected = rows.find(row => ticketId(row) === selectedId) || null;
    const kpis = [
      ['Open', tally.Open, 'open', 'blue'],
      ['In Progress', tally['In Progress'], 'progress', 'orange'],
      ['Resolved', tally.Resolved, 'resolved', 'green'],
      ['Reopened', tally.Reopened, 'reopened', 'violet'],
      ['Total Tickets', rows.length, 'total', 'blue']
    ];
    return `<section class="desk">
      <header class="desk-head">
        <div class="desk-title"><span class="desk-badge">${icon('headset')}</span><div><h2>Help Center</h2><p>Manage support tickets, track issues and provide timely resolutions.</p></div></div>
      </header>
      <div class="desk-kpis">${kpis.map(([label, count, glyph, tone]) => `<article class="kpi ${tone}"><span>${icon(glyph)}</span><div><small>${esc(label)}</small><strong>${count}</strong><em>${label === 'Total Tickets' ? weekDelta('All') : weekDelta(label)}</em></div></article>`).join('')}</div>
      <div class="desk-filters">
        <label>From<input id="helpFrom" type="date"></label>
        <label>To<input id="helpTo" type="date"></label>
        <label>Category<select id="helpTypeFilter"><option value="">All categories</option>${types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join('')}</select></label>
        <label>Status<select id="helpStatusFilter"><option value="">All statuses</option><option>Open</option><option>In Progress</option><option>Resolved</option><option>Reopened</option><option>Closed</option></select></label>
        <label>Priority<select id="helpPriorityFilter"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label>
        <label class="grow">Search<input id="helpSearch" placeholder="Search by ticket, subject or keyword"></label>
        <button class="primary" id="helpApply" type="button">Search</button>
        <button class="ghost" id="helpReset" type="button">Reset</button>
      </div>
      <div class="desk-body">
        <section class="desk-board">
          <div class="desk-tabs">
            ${[['','All Tickets', rows.length],['Open','Open',tally.Open],['In Progress','In Progress',tally['In Progress']],['Resolved','Resolved',tally.Resolved],['Reopened','Reopened',tally.Reopened]].map(([value, label, count]) => `<button type="button" data-tab="${esc(value)}" class="${activeTab === value ? 'active' : ''}">${label} (${count})</button>`).join('')}
          </div>
          <div class="desk-table-wrap"><table><thead><tr><th></th><th>Ticket #</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Created Date</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody id="helpAdminList">${rows.map(rowHtml).join('') || '<tr><td colspan="9">No tickets in this queue.</td></tr>'}</tbody></table></div>
          <footer class="desk-foot">Showing ${rows.length ? 1 : 0}–${rows.length} of ${rows.length}</footer>
        </section>
        ${detail(selected)}
      </div>
    </section>`;
  }

  function applyFilters() {
    const q = String(document.getElementById('helpSearch')?.value || '').toLowerCase();
    const status = document.getElementById('helpStatusFilter')?.value || activeTab;
    const type = document.getElementById('helpTypeFilter')?.value || '';
    const priority = document.getElementById('helpPriorityFilter')?.value || '';
    const from = document.getElementById('helpFrom')?.value || '';
    const to = document.getElementById('helpTo')?.value || '';
    let visible = 0;
    document.querySelectorAll('[data-help-card]').forEach(card => {
      const hide = (q && !card.dataset.search.includes(q)) || (status && card.dataset.status !== status) || (type && card.dataset.type !== type) || (priority && card.dataset.priority !== priority) || (from && card.dataset.created < from) || (to && card.dataset.created > to);
      card.classList.toggle('hidden', hide);
      if (!hide) visible += 1;
    });
    const selectedCard = document.querySelector(`[data-help-card][data-view="${CSS.escape(selectedId)}"]`);
    if (!selectedCard || selectedCard.classList.contains('hidden')) {
      const next = document.querySelector('[data-help-card]:not(.hidden)');
      selectedId = next?.dataset.view || '';
      paintDetail();
    }
    const foot = document.querySelector('.desk-foot');
    if (foot) foot.textContent = `Showing ${visible ? 1 : 0}–${visible} of ${rows.length}`;
    pulse(document.querySelector('.desk-table-wrap'));
  }

  function pulse(node) {
    if (!node) return;
    node.classList.remove('is-refresh');
    void node.offsetWidth;
    node.classList.add('is-refresh');
  }

  function toast(message, type) {
    const root = document.querySelector('.desk');
    if (!root || !message) return;
    let node = document.getElementById('deskToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'deskToast';
      root.appendChild(node);
    }
    node.textContent = message;
    node.className = `desk-toast show ${type === 'error' ? 'error' : 'ok'}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function paintDetail() {
    const selected = rows.find(row => ticketId(row) === selectedId) || null;
    const pane = document.getElementById('helpTicketDetail');
    if (pane) pane.outerHTML = detail(selected);
    const next = document.getElementById('helpTicketDetail');
    pulse(next);
    document.querySelectorAll('[data-help-card]').forEach(card => card.classList.toggle('is-selected', card.dataset.view === selectedId));
  }

  function bind({api, refresh, notify}) {
    const root = document.querySelector('.desk');
    const post = async (id, body, message) => {
      await api(`/marketing-api/help-tickets/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(body) });
      notify(message);
      toast(message, 'ok');
      await refresh();
    };
    const say = (message, type) => { notify(message, type); toast(message, type); };
    document.getElementById('helpApply')?.addEventListener('click', () => { applyFilters(); say('Filters applied.'); });
    document.getElementById('helpSearch')?.addEventListener('keydown', event => { if (event.key === 'Enter') { applyFilters(); say('Filters applied.'); } });
    document.getElementById('helpReset')?.addEventListener('click', () => {
      ['helpSearch','helpFrom','helpTo'].forEach(id => { const field = document.getElementById(id); if (field) field.value = ''; });
      ['helpTypeFilter','helpStatusFilter','helpPriorityFilter'].forEach(id => { const field = document.getElementById(id); if (field) field.value = ''; });
      activeTab = '';
      document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === ''));
      applyFilters();
      say('Filters cleared.');
    });
    root?.addEventListener('click', async event => {
      const tab = event.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        activeTab = tab.dataset.tab || '';
        const status = document.getElementById('helpStatusFilter');
        if (status) status.value = activeTab;
        root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button === tab));
        applyFilters();
        say(activeTab ? `Showing ${activeTab} tickets.` : 'Showing all tickets.');
        return;
      }
      const statusButton = event.target.closest('[data-help-status]');
      if (statusButton && root.contains(statusButton)) {
        statusButton.disabled = true;
        statusButton.classList.add('is-busy');
        try { await post(statusButton.dataset.helpStatus, { status: statusButton.dataset.next }, `Ticket marked ${statusButton.dataset.next === 'Solved' ? 'Resolved' : statusButton.dataset.next}.`); }
        catch (error) { say(error.message, 'error'); statusButton.disabled = false; statusButton.classList.remove('is-busy'); }
        return;
      }
      const noteButton = event.target.closest('[data-add-note]');
      if (noteButton && root.contains(noteButton)) {
        const field = document.getElementById('helpNote');
        const note = field?.value.trim();
        if (!note) { field?.classList.add('is-shake'); setTimeout(() => field?.classList.remove('is-shake'), 420); say('Type a note first.', 'error'); return; }
        noteButton.classList.add('is-busy');
        try { await post(noteButton.dataset.addNote, { note }, 'Note added.'); }
        catch (error) { say(error.message, 'error'); noteButton.classList.remove('is-busy'); }
        return;
      }
      const assign = event.target.closest('[data-assign]');
      if (assign) {
        const name = window.prompt('Assign this ticket to');
        if (name === null) return;
        try { await post(assign.dataset.assign, { assignedTo: name.trim() }, 'Ticket assigned.'); } catch (error) { say(error.message, 'error'); }
        return;
      }
      const priority = event.target.closest('[data-set-priority]');
      if (priority) {
        const next = window.prompt('Priority: High, Medium or Low', 'Medium');
        if (!next) return;
        try { await post(priority.dataset.setPriority, { priority: next.trim() }, 'Priority updated.'); } catch (error) { say(error.message, 'error'); }
        return;
      }
      const tag = event.target.closest('[data-tag]');
      if (tag) {
        const value = window.prompt('Tag');
        if (!value) return;
        try { await post(tag.dataset.tag, { tag: value.trim() }, 'Tag added.'); } catch (error) { say(error.message, 'error'); }
        return;
      }
      const progress = event.target.closest('[data-progress]');
      if (progress) {
        try { await post(progress.dataset.progress, { status: 'In Progress' }, 'Ticket marked In Progress.'); } catch (error) { say(error.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-print]')) { window.print(); return; }
      const view = event.target.closest('[data-view]');
      if (view && root.contains(view) && !event.target.closest('input')) {
        selectedId = view.dataset.view || '';
        paintDetail();
      }
    });
  }
  return { render, bind };
})();
