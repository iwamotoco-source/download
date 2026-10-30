const CACHE='xtract-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/icon.svg','/manifest.webmanifest'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const r=event.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(r).then(resp=>{if(resp.ok && (u.pathname==='/'||u.pathname.startsWith('/assets/')||u.pathname==='/icon.svg')){const copy=resp.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(r,copy)))}return resp}).catch(()=>caches.match(r)));
});