const VERSION='download-tools-v4';
const SHELL=['/','/x.html','/shrink.html','/icon.svg','/shrink-icon.svg','/manifest.webmanifest','/shrink.webmanifest'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(VERSION).then(async c=>{
  await Promise.allSettled(SHELL.map(path=>c.add(path)));
 }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 const isStatic=SHELL.includes(url.pathname)||url.pathname.startsWith('/assets/')||/\.(png|svg|webmanifest|css|js)$/.test(url.pathname);
 if(!isStatic)return;
 // Network-first avoids stale tool and manifest assets during updates.
 e.respondWith(fetch(req).then(response=>{
  if(response.ok&&response.type==='basic'){
   const copy=response.clone();e.waitUntil(caches.open(VERSION).then(c=>c.put(req,copy)));
  }
  return response;
 }).catch(()=>caches.match(req)));
});
