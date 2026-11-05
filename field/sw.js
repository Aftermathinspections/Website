// AIS Field: keeps the app itself available offline. Data and plans are handled by the page.
const C="ais-field-shell-v1";
const CDN=/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//;
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(["./","manifest.json","icon-180.png"]).catch(()=>{})))});
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=r.url;
  if(CDN.test(u)){e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(r);if(hit)return hit;const res=await fetch(r);if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}));return}
  if(u.startsWith(self.location.origin+"/field/")&&!u.includes("plan-cache/")){e.respondWith(fetch(r).then(res=>{if(res.ok)caches.open(C).then(c=>c.put(r,res.clone()));return res}).catch(()=>caches.match(r).then(h=>h||caches.match("./"))))}
});
