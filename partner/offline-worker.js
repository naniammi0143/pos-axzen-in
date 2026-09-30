const CACHE='axzen-pos-shell-3.79';
const SHELL=['./','index.html','dine-in.js','dine-in.css','bill-taxes.js','dine-in-offline.js','restaurant-settings.js','restaurant-settings.css','offline-shell.js','app-updater.js','app-updater.css','help-center.js','help-center.css','catalog-import.js','catalog-import.css','assets/topbarlogo.png','assets/axzenPOS.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('axzen-pos-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const relative=url.pathname.slice(scope.pathname.length);
 // Never cache API responses, authenticated requests, bills, or live reload streams.
 if(request.headers.has('Authorization')||(!SHELL.includes(relative)&&relative!==''))return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   if(request.mode==='navigate'){
     try{const response=await fetch(request);if(response.ok)await cache.put('index.html',response.clone());return response;}catch{const saved=await cache.match('index.html');return saved||Response.error();}
   }
   return await cache.match(request,{ignoreSearch:true}) || fetch(request);
 })());
});
