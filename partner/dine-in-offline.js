/* Durable local-first table operations. The server remains the authority on replay. */
window.DineOffline = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  function create({ scope, api:remote, getMenu, getSettings, user, storage = localStorage, online = () => navigator.onLine, onChange = () => {} }) {
    if (!scope) throw Error('Restaurant and user identity are required for offline table service');
    const key = 'AXZEN_DINE_OFFLINE_V1:' + scope;
    let running = null, stopped = false;
    const empty = () => ({ access:null, menu:[], drafts:{}, queue:[], bills:[], syncError:'', lastSync:null });
    function read() { const raw=storage.getItem(key); if(!raw)return empty(); try {return JSON.parse(raw);} catch {throw Error('Saved table data could not be read. Keep this device data and contact your administrator.');} }
    function write(data) { try {storage.setItem(key,JSON.stringify(data));} catch {throw Error('Device storage is full. Order was not saved; free space before continuing.');} if(!stopped)onChange(status()); }
    const status = () => {const data=read();return {pending:data.queue.length,error:data.syncError,offline:!online(),lastSync:data.lastSync};};
    const lock = (name, fn) => globalThis.navigator?.locks ? navigator.locks.request(key+name,fn) : Promise.resolve().then(fn);
    function mergeAccess(data, fresh) {
      const pending = new Set(data.queue.map(q=>q.tableId));
      const local = data.access?.tables || [];
      data.access={...fresh,tables:fresh.tables.map(t=>{const saved=local.find(l=>l.tableId===t.tableId);return saved&&(pending.has(t.tableId)||saved.revision>t.revision)?saved:t;})};
      if(pending.size) for(const t of local) if(pending.has(t.tableId)&&!data.access.tables.some(r=>r.tableId===t.tableId))data.access.tables.push(t);
    }
    async function refresh() {
      if (!online()) {const data=read();if(!data.access)throw Error('Connect once to download your restaurant tables and menu before using Dine In offline.');return clone(data.access);}
      try {
        const fresh=await remote('/dine-in',{timeoutMs:2500});
        return await lock(':data',()=>{const data=read();mergeAccess(data,fresh);data.lastSync=new Date().toISOString();write(data);return clone(data.access);});
      } catch(e) {
        if(e.status>=400&&e.status<500){if([401,403].includes(e.status))await lock(':data',()=>{const data=read();if(data.access)data.access.enabled=false;data.syncError=e.message;write(data);});throw e;}
        const data=read();if(!data.access)throw e;return clone(data.access);
      }
    }
    function apply(data,path,body) {
      if(!data.access?.enabled)throw Error('Dine In is not enabled. Connect and request activation.');
      if(data.access.offlineVersion!==1)throw Error('Update the restaurant server to enable offline table orders and safe sync.');
      const tableId=path.split('/')[3], row=data.access.tables.find(t=>t.tableId===tableId);
      if(!row)throw Error('Table not found in the saved restaurant');
      const op={id:uuid(),path,body:clone(body),tableId,createdAt:new Date().toISOString()};
      op.body.operationId=op.id;op.body.expectedSessionId=row.session?.id||null;
      op.body.revision=row.revision;
      let result;
      if(path.endsWith('/tickets')) {
        if(!['admin','manager','cashier','billing','user','waiter'].includes(user.role))throw Error('Your role cannot take table orders');
        if(!row.active||!['available','reserved','occupied'].includes(row.status))throw Error('Table is unavailable');
        if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)throw Error('Choose 1–100 items');
        if(row.session?.tickets.length>=100)throw Error('Settle this bill before adding more tickets');
        const prior=row.session?.tickets.find(t=>t.id===body.requestId);if(prior)return {table:row,ticket:prior,duplicate:true};
        const items=body.items.map(i=>{
          const p=data.menu.find(p=>String(p.id)===String(i.id)&&!p.hidden);
          if(!p)throw Error('Dish is not in the saved menu');
          const option=i.optionName?(p.subItems||[]).find(o=>o.name===i.optionName):null;
          if(i.optionName&&!option)throw Error('Portion is not in the saved menu');
          const qty=Number(i.qty),price=Number(option?option.price:p.price);
          if(!Number.isInteger(qty)||qty<1||qty>999||!Number.isFinite(price)||price<0||p.billingType==='weight'||p.weightUnit)throw Error('Invalid dish quantity or price');
          return {...i,qty,price};
        });
        const guests=Number(body.guests||1);if(!Number.isInteger(guests)||guests<1||guests>row.seats)throw Error('Guests must fit this table');
        row.session ||= {id:uuid(),openedAt:op.createdAt,guests,tickets:[]};
        op.body.sessionId=row.session.id;op.body.expectedPrices=items.map(i=>i.price);
        const ticket={id:body.requestId,number:row.session.tickets.length+1,createdAt:op.createdAt,waiter:user.name,items,status:'new',local:true};
        row.session.tickets.push(ticket);row.status='occupied';row.reservation='';row.revision++;
        result={table:row,ticket,offline:true};
      } else if(path.includes('/tickets/')) {
        if(!['admin','manager','cashier','billing','user','waiter','chef'].includes(user.role))throw Error('Your role cannot update kitchen tickets');
        if(row.status!=='occupied')throw Error('Table is not open');
        const ticket=row.session?.tickets.find(t=>t.id===path.split('/').pop());if(!ticket)throw Error('Kitchen ticket not found');
        if(body.status==='cancelled') {if(!['admin','manager'].includes(user.role)||['served','cancelled'].includes(ticket.status)||!body.reason)throw Error('Manager approval and a reason are required to cancel this ticket');}
        else if({new:'preparing',preparing:'ready',ready:'served'}[ticket.status]!==body.status)throw Error('Invalid kitchen status change');
        ticket.status=body.status;ticket.reason=body.reason||'';row.revision++;result={table:row};
      } else if(path.endsWith('/settle')) {
        if(!['admin','manager','cashier','billing','user'].includes(user.role))throw Error('Only a cashier or manager can collect payment');
        if(!row.session||row.session.id!==body.sessionId)throw Error('Table session changed');
        if(row.session.tickets.some(t=>!['served','cancelled'].includes(t.status)))throw Error('Serve or cancel all kitchen tickets before collecting payment');
        const items=row.session.tickets.filter(t=>t.status!=='cancelled').flatMap(t=>t.items);if(!items.length)throw Error('No billable items');
        if(Number(body.discount||0)&&!['admin','manager'].includes(user.role))throw Error('Only a manager can apply a discount');
        const summary=BillTaxes.calculate(items.reduce((s,i)=>s+i.price*i.qty,0),Number(body.discount||0),data.access.taxSettings||getSettings().taxSettings);
        if(!['Cash','Online','Card','Split'].includes(body.payment))throw Error('Select a valid payment method');
        const cash=body.payment==='Cash'?summary.total:body.payment==='Split'?Number(body.cash):0;
        if(!Number.isFinite(cash)||cash<0||cash>summary.total||BillTaxes.round(cash)!==cash)throw Error('Invalid split cash amount');
        const order={...summary,id:Date.now(),createdAt:op.createdAt,clientOrderId:'dine-'+row.session.id,dineSessionId:row.session.id,orderType:'Dine In',tableId,tableName:row.name,canteen:getSettings().canteenName,cashier:user.name,cashierMobile:user.mobile,payment:body.payment,paymentBreakup:{cash,online:BillTaxes.round(summary.total-cash),credit:0},items,kitchenTickets:clone(row.session.tickets),local:true};
        op.body.expectedTotal=summary.total;op.body.billId=order.id;op.body.billCreatedAt=order.createdAt;
        data.bills.push(order);row.lastBill=order;row.session=null;row.status='cleaning';row.revision+=2;result={order,offline:true};
      } else if(path.endsWith('/state')) {
        if(!['admin','manager','cashier','billing','user','waiter'].includes(user.role))throw Error('Your role cannot change table state');
        const allowed={available:['reserved'],reserved:['available'],cleaning:['available']};
        if(!allowed[row.status]?.includes(body.status))throw Error('Invalid table state change');
        row.status=body.status;row.reservation=body.status==='reserved'?body.reservation||'':'';row.revision++;result={table:row};
      } else throw Error('This action requires an online admin connection');
      data.queue.push(op);return clone(result);
    }
    async function sync() {
      if(stopped||!online())return status();if(running)return running;
      running=lock(':sync',async()=>{
        while(!stopped&&online()) {
          const op=read().queue[0];if(!op)break;
          try {
            const response=await remote(op.path,{method:'POST',body:JSON.stringify(op.body),timeoutMs:4000});
            await lock(':data',()=>{const data=read();data.queue=data.queue.filter(q=>q.id!==op.id);data.syncError='';data.lastSync=new Date().toISOString();if(response.order)data.bills=data.bills.filter(b=>b.clientOrderId!==response.order.clientOrderId);if(response.table&&!data.queue.some(q=>q.tableId===op.tableId)){const index=data.access.tables.findIndex(t=>t.tableId===op.tableId);if(index>=0)data.access.tables[index]=response.table;}write(data);});
          } catch(e) {
            await lock(':data',()=>{const data=read();data.syncError=e.status>=400&&e.status<500?`Table sync needs review: ${e.message}. Saved orders remain on this device.`:'Offline · orders saved on this device. Waiting to sync.';write(data);});
            break;
          }
        }
        return status();
      }).finally(()=>{running=null;});return running;
    }
    async function api(path,opts={}) {
      if(stopped)throw Error('This restaurant session has ended');
      if(path==='/dine-in'&&opts.method!=='POST'){void sync().catch(()=>{});return refresh();}
      if(path==='/orders') {const data=read();let rows=[];if(online())try{rows=await remote(path,{timeoutMs:2500});}catch(e){if(e.status>=400&&e.status<500)throw e;}return [...rows,...data.bills.filter(b=>!rows.some(r=>r.clientOrderId===b.clientOrderId))];}
      if(path.startsWith('/dine-in/tables/')&&opts.method==='POST') {
        const result=await lock(':data',()=>{const data=read(),result=apply(data,path,JSON.parse(opts.body));write(data);return result;});void sync().catch(()=>{});return result;
      }
      return remote(path,opts);
    }
    async function menu() {const data=read();try{const items=await getMenu();if(items?.length){await lock(':data',()=>{const latest=read();latest.menu=clone(items);write(latest);});return items;}}catch(e){if(!data.menu.length)throw e;}return data.menu;}
    const draft = tableId => {const raw=storage.getItem(key+':draft:'+tableId);if(!raw)return null;try{return JSON.parse(raw);}catch{throw Error('Saved table draft could not be read');}};
    function saveDraft(tableId,value) {try{storage.setItem(key+':draft:'+tableId,JSON.stringify(value));}catch{throw Error('Device storage is full. Current table draft could not be saved.');}}
    async function updateTaxSettings(value) {
      const normalized = BillTaxes.normalize(value);
      await lock(':data',()=>{const data=read();if(data.access)data.access.taxSettings=normalized;write(data);});
    }
    function stop(){stopped=true;}
    return { api,menu,sync,status,draft,saveDraft,stop,updateTaxSettings,exportData:()=>JSON.stringify(read(),null,2) };
  }
  return {create};
})();
