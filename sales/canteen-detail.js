window.CanteenDetail = (() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>'Rs '+Number(value||0).toLocaleString('en-IN');
  const numeric=value=>Number(String(value||'').replace(/[^0-9.]/g,'')||0);
  const date=value=>value?new Date(value).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'-';
  function render({canteen,payments=[],plans=[],canManage=false}){
    const mine=payments.filter(row=>Number(row.canteenId)===Number(canteen.id));
    const activePlans=plans.filter(plan=>plan.active!==false);
    const initials=String(canteen.canteenName||'C').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
    const planOptions=activePlans.map(plan=>`<option value="${esc(plan.name)}" data-price="${numeric(plan.offerPrice)}" ${plan.name===canteen.selectedPlan?'selected':''}>${esc(plan.name)} · ${numeric(plan.offerPrice)?money(numeric(plan.offerPrice))+'/month':'Custom price'}</option>`).join('');
    const paymentRows=mine.slice(0,8).map(row=>`<div class="detail-payment"><div><strong>${money(row.amount)}</strong><br><span class="muted">${esc(row.paymentMode||'-')}${row.paymentReference?` · ${esc(row.paymentReference)}`:''}</span></div><span class="muted">${date(row.createdAt)}</span></div>`).join('')||'<div class="muted">No payments recorded.</div>';
    const usingVersion=canteen.appInstalledVersion||'Not reported';
    const planEnded=canteen.planExpiryDate&&new Date(`${String(canteen.planExpiryDate).slice(0,10)}T23:59:59+05:30`)<new Date();
    const posEnabled=(canteen.status==='Active'||canteen.status==='Trial')&&canteen.status!=='Blocked'&&!planEnded;
    const posDetail=posEnabled?`Access until ${date(canteen.planExpiryDate)}.`:`Previous plan ended ${date(canteen.planExpiryDate)}.`;
    return `<div class="canteen-detail"><button class="ghost detail-back" id="detailBack" type="button">← Back to Canteens</button><section class="detail-hero"><div class="detail-logo">${esc(initials)}</div><div class="detail-title"><h2>${esc(canteen.canteenName)}</h2><p>${esc([canteen.city,canteen.state].filter(Boolean).join(', ')||'-')} · ID: ${esc(canteen.activatedCanteenId||'Not activated')}</p><div><span class="pill blue">${esc(canteen.businessCategory||'Canteen')}</span> <span class="pill ${canteen.status==='Active'?'green':'orange'}">${esc(canteen.status||'Pending')}</span></div></div><div class="detail-actions">${canteen.canteenLoginId?`<a class="primary pos-open" href="/mobile?loginId=${encodeURIComponent(canteen.canteenLoginId)}&restaurantId=${encodeURIComponent(canteen.activatedCanteenId||'')}" target="_blank" rel="noopener">Open POS</a>`:''}</div></section><div class="detail-tabs"><span class="active">Overview</span><span>Orders</span><span>Menu & Stock</span><span>Dine-In & Tables</span><span>Staff & Roles</span><span>Billing</span><span>Printers</span><span>Reports</span></div><section class="detail-kpis"><article class="detail-kpi"><span>Total Paid</span><strong>${money(canteen.paidAmount)}</strong></article><article class="detail-kpi"><span>Payment Records</span><strong>${mine.length}</strong></article><article class="detail-kpi"><span>Printers</span><strong>${Number(canteen.printersAssigned||0)} / ${Number(canteen.printersRequired||0)}</strong></article><article class="detail-kpi"><span>Pending Dues</span><strong>${money(canteen.pendingAmount)}</strong></article></section><div class="detail-layout"><div class="detail-stack"><section class="detail-panel"><h3>Canteen Details</h3><div class="detail-facts"><div class="detail-fact"><span>Canteen name</span><strong>${esc(canteen.canteenName)}</strong></div><div class="detail-fact"><span>Owner</span><strong>${esc(canteen.ownerName||'-')}</strong></div><div class="detail-fact"><span>Phone</span><strong>${esc(canteen.ownerMobile||'-')}</strong></div><div class="detail-fact"><span>Location</span><strong>${esc([canteen.address,canteen.city,canteen.state].filter(Boolean).join(', ')||'-')}</strong></div><div class="detail-fact"><span>Account ID</span><strong>${esc(canteen.activatedCanteenId||'-')}</strong></div><div class="detail-fact"><span>Current plan</span><strong>${esc(canteen.selectedPlan||'-')} (${esc(canteen.planType||'-')})</strong></div><div class="detail-fact"><span>Plan expiry</span><strong>${esc(canteen.planExpiryDate||'-')}</strong></div><div class="detail-fact"><span>Using version</span><strong>${esc(canteen.appInstalledVersion||'Not reported')}</strong></div><div class="detail-fact"><span>Assigned version</span><strong>${esc(canteen.appReleaseVersion||'Bundled APK')}</strong></div><div class="detail-fact"><span>Marketing owner</span><strong>${esc(canteen.submittedByName||canteen.submittedBy||'-')}</strong></div><div class="detail-fact"><span>Login ID</span><strong>${esc(canteen.canteenLoginId||'After activation')}</strong></div></div></section><section class="detail-panel"><h3>Service Controls</h3><div class="service-row"><div class="service-copy"><strong>Dine-In Service</strong><p>Tables, kitchen orders and table bills.</p></div><div class="service-actions"><span class="pill orange" id="dineStatusPill">Restricted</span>${canManage&&canteen.activatedCanteenId?`<button class="secondary" id="detailDineIn" type="button">Manage</button>`:''}</div></div><div class="service-row"><div class="service-copy"><strong>POS Access</strong><p>${esc(posDetail)}</p>${canteen.posTrialReason?`<p>Trial reason: ${esc(canteen.posTrialReason)}</p>`:''}</div><div class="service-actions"><span class="pill blue">Using ${esc(usingVersion)}</span><span class="pill ${posEnabled?'green':'orange'}">${posEnabled?'Enabled':'Restricted'}</span>${canManage?`<button class="secondary" id="detailPosTrial" type="button">Manage</button>`:''}</div></div><div class="service-row"><div class="service-copy"><strong>Takeaway Service</strong><p>Counter billing and the Takeaway tab in POS.</p></div><div class="service-actions"><span class="pill green" id="takeawayStatusPill">Enabled</span>${canManage?`<button class="secondary" id="detailTakeaway" type="button">Manage</button>`:''}</div></div></section><section class="detail-panel"><h3>Payment History</h3>${paymentRows}</section></div><div class="detail-stack"><section class="detail-panel"><h3>Plan & Cash Payment</h3><div class="detail-facts" style="margin-bottom:16px"><div class="detail-fact"><span>Current plan</span><strong>${esc(canteen.selectedPlan||'-')}</strong></div><div class="detail-fact"><span>Expiry</span><strong>${esc(canteen.planExpiryDate||'-')}</strong></div><div class="detail-fact"><span>Pending</span><strong>${money(canteen.pendingAmount)}</strong></div></div>${canManage?`<form class="cash-form" id="cashPlanForm"><label>Plan<select id="cashPlanName" required>${planOptions}</select></label><label>Duration<select id="cashPlanMonths"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="12">12 months</option></select></label><div class="cash-amount-note" id="cashExpected">Plan amount</div><label>Cash received<input id="cashPlanAmount" type="number" min="1" step="1" required></label><label>Receipt / reference<input id="cashReference" maxlength="80" placeholder="Cash receipt number"></label><label>Notes<textarea id="cashNotes" maxlength="300" placeholder="Optional"></textarea></label><label class="cash-confirm"><input id="cashConfirmed" type="checkbox" required><span>I confirm that the full cash amount was received from this canteen.</span></label><button class="primary" id="activateCashPlan" type="submit">Record Cash & Activate Plan</button><div class="status" id="cashPlanStatus"></div></form>`:'<div class="muted">Admin permission is required to activate a cash plan.</div>'}</section><section class="detail-panel detail-danger"><h3>Account Control</h3><p class="muted">Blocking stops staff from accessing the POS.</p>${canManage?`<button class="${canteen.status==='Blocked'?'secondary':'danger'}" id="detailBlock" type="button">${canteen.status==='Blocked'?'Unblock Canteen':'Block Canteen'}</button>`:''}</section></div></div></div>`;
  }
  function openAccessDialog({title,canteen,api,pillId,path,onText,offText}){
    const dialog=document.createElement('dialog');
    dialog.className='service-dialog';
    const paint=enabled=>{
      dialog.querySelector('[data-state]').textContent=enabled?'Enabled':'Restricted';
      dialog.querySelector('[data-note]').textContent=enabled?onText:offText;
      const pill=document.getElementById(pillId);
      if(pill){pill.textContent=enabled?'Enabled':'Restricted';pill.className=`pill ${enabled?'green':'orange'}`;}
    };
    dialog.innerHTML=`<h2>${esc(title)}</h2><p>${esc(canteen.canteenName)}</p><p>Status: <strong data-state>Loading…</strong></p><p data-note></p><div class="status" data-status></div><div class="row-actions"><button class="service-enable" data-enable type="button">Enable</button><button class="service-disable" data-disable type="button">Disable</button><button class="service-close" data-close type="button">Close</button></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.showModal();
    const save=async enabled=>{
      dialog.querySelector('[data-enable]').disabled=true;
      dialog.querySelector('[data-disable]').disabled=true;
      try{
        const access=await api(path,{method:'POST',body:JSON.stringify({enabled})});
        paint(access.enabled!==false&&enabled);
      }catch(error){dialog.querySelector('[data-status]').textContent=error.message;dialog.querySelector('[data-status]').className='status error';}
      finally{dialog.querySelector('[data-enable]').disabled=false;dialog.querySelector('[data-disable]').disabled=false;}
    };
    dialog.querySelector('[data-enable]').onclick=()=>save(true);
    dialog.querySelector('[data-disable]').onclick=()=>save(false);
    api(path).then(access=>paint(access.enabled===true)).catch(error=>{dialog.querySelector('[data-status]').textContent=error.message;dialog.querySelector('[data-status]').className='status error';});
  }
  function openPosTrial(canteen,api,onUpdated){
    const dialog=document.createElement('dialog');
    dialog.className='service-dialog';
    const ended=canteen.planExpiryDate&&new Date(`${String(canteen.planExpiryDate).slice(0,10)}T23:59:59+05:30`)<new Date();
    const enabled=(canteen.status==='Active'||canteen.status==='Trial')&&canteen.status!=='Blocked'&&!ended;
    dialog.innerHTML=`<h2>POS trial access</h2><p>${esc(canteen.canteenName)}</p><p>Using version: <strong>${esc(canteen.appInstalledVersion||'Not reported')}</strong></p><p>Status: <strong data-state>${enabled?'Enabled':'Restricted'}</strong></p>${enabled?'':`<p>Previous plan ended ${esc(date(canteen.planExpiryDate))}.</p>`}<label>Trial days<input id="posTrialDays" type="number" min="1" max="365" value="7"></label><label>Reason<textarea id="posTrialReason" maxlength="300" placeholder="Why this trial is being enabled"></textarea></label><div class="status" data-status></div><div class="row-actions"><button class="service-enable" data-enable type="button">Enable</button><button class="service-disable" data-disable type="button">Disable</button><button class="service-close" data-close type="button">Close</button></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    const setBusy=busy=>{dialog.querySelector('[data-enable]').disabled=busy;dialog.querySelector('[data-disable]').disabled=busy;};
    dialog.querySelector('[data-enable]').onclick=async()=>{
      const days=Number(dialog.querySelector('#posTrialDays').value||0);
      const reason=dialog.querySelector('#posTrialReason').value.trim();
      const message=dialog.querySelector('[data-status]');
      if(days<1){message.textContent='Enter how many trial days to give.';message.className='status error';return;}
      if(reason.length<3){message.textContent='Enter a reason for this trial.';message.className='status error';return;}
      setBusy(true);
      try{
        await api(`/marketing-api/canteens/${canteen.id}/plan`,{method:'POST',body:JSON.stringify({status:'Trial',planType:'Trial',selectedPlan:canteen.selectedPlan||'Starter',planStartDate:new Date().toISOString().slice(0,10),trialDays:days,reason})});
        if(onUpdated)await onUpdated();
        dialog.close();
      }catch(error){message.textContent=error.message;message.className='status error';setBusy(false);}
    };
    dialog.querySelector('[data-disable]').onclick=async()=>{
      const message=dialog.querySelector('[data-status]');
      setBusy(true);
      try{
        await api(`/marketing-api/canteens/${canteen.id}/plan`,{method:'POST',body:JSON.stringify({status:'Expired',planType:canteen.planType||'Trial',selectedPlan:canteen.selectedPlan||'Starter'})});
        if(onUpdated)await onUpdated();
        dialog.close();
      }catch(error){message.textContent=error.message;message.className='status error';setBusy(false);}
    };
    dialog.showModal();
  }
  function bind({canteen,plans,api,onBack,onUpdated,onDineIn,onBlock}){
    document.getElementById('detailBack')?.addEventListener('click',onBack);
    const paintPill=(id,enabled)=>{const pill=document.getElementById(id);if(!pill)return;pill.textContent=enabled?'Enabled':'Restricted';pill.className=`pill ${enabled?'green':'orange'}`;};
    document.getElementById('detailDineIn')?.addEventListener('click',()=>openAccessDialog({title:'Dine In',canteen,api,pillId:'dineStatusPill',path:`/marketing-api/canteens/${canteen.id}/dine-in`,onText:'Tables, kitchen orders and table bills are on.',offText:'Dine In is off until you enable it.'}));
    if(canteen.activatedCanteenId&&api)api(`/marketing-api/canteens/${canteen.id}/dine-in`).then(access=>paintPill('dineStatusPill',access.enabled===true)).catch(()=>{});
    document.getElementById('detailPosTrial')?.addEventListener('click',()=>openPosTrial(canteen,api,onUpdated));
    document.getElementById('detailTakeaway')?.addEventListener('click',()=>openAccessDialog({title:'Takeaway',canteen,api,pillId:'takeawayStatusPill',path:`/marketing-api/canteens/${canteen.id}/takeaway`,onText:'The Takeaway tab stays available in POS.',offText:'Takeaway is hidden in POS until you enable it.'}));
    if(api)api(`/marketing-api/canteens/${canteen.id}/takeaway`).then(access=>paintPill('takeawayStatusPill',access.enabled!==false)).catch(()=>{});
    document.getElementById('detailBlock')?.addEventListener('click',()=>onBlock(canteen));
    const form=document.getElementById('cashPlanForm');if(!form)return;
    const updateAmount=()=>{const option=document.getElementById('cashPlanName').selectedOptions[0];const months=Number(document.getElementById('cashPlanMonths').value);const expected=Number(option?.dataset.price||0)*months;document.getElementById('cashExpected').textContent=expected?`Plan amount: ${money(expected)}`:'Enter the agreed custom cash amount';if(expected)document.getElementById('cashPlanAmount').value=expected;};
    document.getElementById('cashPlanName').addEventListener('change',updateAmount);document.getElementById('cashPlanMonths').addEventListener('change',updateAmount);updateAmount();
    form.addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('activateCashPlan'),status=document.getElementById('cashPlanStatus');button.disabled=true;status.textContent='Activating plan…';try{await api(`/marketing-api/canteens/${canteen.id}/activate-cash-plan`,{method:'POST',body:JSON.stringify({planName:document.getElementById('cashPlanName').value,months:Number(document.getElementById('cashPlanMonths').value),amount:Number(document.getElementById('cashPlanAmount').value),cashReference:document.getElementById('cashReference').value,notes:document.getElementById('cashNotes').value,confirmCashReceived:document.getElementById('cashConfirmed').checked})});status.textContent='Cash recorded and plan activated.';status.className='status ok';await onUpdated();}catch(error){status.textContent=error.message;status.className='status error';button.disabled=false;}});
  }
  return {render,bind};
})();
