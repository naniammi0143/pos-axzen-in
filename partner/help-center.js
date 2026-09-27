window.HelpCenter = (() => {
  const fallbackProblems = ['Printer is not printing','Printer connection problem','Login or password problem','Billing or order problem','Menu, item or price problem','Reports problem','Dine In or table problem','Payment or subscription problem','App sync or offline problem','Other problem'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => value ? new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
  function ticketsHtml(tickets) {
    if (!tickets.length) return '<div class="muted">No help requests yet.</div>';
    return tickets.map(ticket => {
      const solved = ticket.status === 'Solved';
      return `<article class="help-ticket"><div class="help-ticket-head"><div><strong>${esc(ticket.problemType || ticket.title)}</strong><br><small>Ticket #${esc(ticket.id || String(ticket._id || '').slice(-6))} · ${date(ticket.createdAt)}</small></div><span class="help-badge ${solved?'solved':''}">${esc(ticket.status || 'Pending')}</span></div><p>${esc(ticket.message || '')}</p>${solved ? `<small>Solved${ticket.resolvedBy ? ` by ${esc(ticket.resolvedBy)}` : ''}${ticket.resolvedAt ? ` · ${date(ticket.resolvedAt)}` : ''}</small>` : '<small>Our support team will update this ticket.</small>'}</article>`;
    }).join('');
  }
  async function mount(root, options) {
    const savedPhone = /^[+]?\d[\d -]{7,18}$/.test(String(options.user?.mobile || '')) ? options.user.mobile : '';
    root.innerHTML = `<div class="help-center"><section class="help-hero"><div><h2>Help Center</h2><div class="muted">Send a POS problem and track its status here.</div></div><a class="help-phone" id="helpPhone" href="tel:8790568446">Call 8790568446</a></section><section class="help-form-card"><h3>Create help request</h3><form class="help-form" id="helpRequestForm"><label>Your name<input id="helpCustomerName" value="${esc(options.user?.name || '')}" maxlength="80" required></label><label>Phone number<input id="helpCustomerPhone" value="${esc(savedPhone)}" inputmode="tel" maxlength="20" required></label><label class="wide">Problem<select id="helpProblem" required><option value="">Select a problem</option>${fallbackProblems.map(item=>`<option>${esc(item)}</option>`).join('')}</select></label><label class="wide">Tell us what you need<textarea id="helpMessage" maxlength="1000" placeholder="Explain what happened and what you were trying to do" required></textarea></label><div class="wide"><button class="primary" id="helpSubmit" type="submit">Submit help request</button><div class="status help-status" id="helpFormStatus"></div></div></form></section><section class="help-track-card"><div class="help-ticket-head"><div><h3>Your requests</h3><div class="muted">Pending and solved requests for ${esc(options.settings?.canteenName || 'this organization')}.</div></div><button class="secondary" id="helpRefresh" type="button">Refresh</button></div><div class="help-tickets" id="helpTickets"><div class="muted">Loading requests…</div></div></section></div>`;
    const status = root.querySelector('#helpFormStatus');
    const load = async () => {
      try {
        const [problemData,ticketData] = await Promise.all([options.api('/help/problems',{timeoutMs:10000}),options.api('/help/tickets',{timeoutMs:10000})]);
        const select=root.querySelector('#helpProblem');const selected=select.value;
        select.innerHTML='<option value="">Select a problem</option>'+problemData.problems.map(item=>`<option>${esc(item)}</option>`).join('');select.value=selected;
        const phone=String(problemData.supportPhone||'8790568446');const link=root.querySelector('#helpPhone');link.textContent='Call '+phone;link.href='tel:'+phone;
        root.querySelector('#helpTickets').innerHTML=ticketsHtml(ticketData.tickets||[]);
      } catch(error) { root.querySelector('#helpTickets').innerHTML=`<div class="status error">${esc(error.message)}</div>`; }
    };
    root.querySelector('#helpRefresh').onclick=load;
    root.querySelector('#helpRequestForm').onsubmit=async event => {
      event.preventDefault();const button=root.querySelector('#helpSubmit');button.disabled=true;status.textContent='Submitting…';status.className='status help-status';
      try {
        await options.api('/help/tickets',{method:'POST',timeoutMs:15000,body:JSON.stringify({customerName:root.querySelector('#helpCustomerName').value,phone:root.querySelector('#helpCustomerPhone').value,problemType:root.querySelector('#helpProblem').value,message:root.querySelector('#helpMessage').value})});
        status.textContent='Help request submitted. You can track it below.';status.className='status ok help-status';root.querySelector('#helpProblem').value='';root.querySelector('#helpMessage').value='';await load();
      } catch(error) { status.textContent=error.message;status.className='status error help-status'; }
      finally { button.disabled=false; }
    };
    await load();
  }
  return {mount, fallbackProblems};
})();
